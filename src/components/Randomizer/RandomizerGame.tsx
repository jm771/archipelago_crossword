/* eslint-disable max-classes-per-file */
import React, {Component} from 'react';
import {GameJson} from '../../shared/types';
import {Paper, TextField, Button, Typography, Box, Chip} from '@material-ui/core';
import {MdCheckCircle, MdCancel} from 'react-icons/md';
import './RandomizerGame.css';
import {Client} from '../../archipelago.js';

// Utility function to seed a random number generator
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

interface ClueData {
  id: string; // e.g., "across-5" or "down-12"
  direction: 'across' | 'down';
  number: number;
  text: string;
  answer: string; // The correct answer from solution
  cells: {r: number; c: number}[]; // Grid positions for this clue
}

interface RandomizerState {
  clues: ClueData[];
  shuffledClues: ClueData[];
  answers: {[clueId: string]: string}; // User's current answer for each clue (local only)
  feedbackClue: string | null; // Which clue is showing feedback
  feedbackType: 'correct' | 'incorrect' | null;
  rewardAllocations: {[clueId: string]: {clueId: string; letterIndex: number}[]}; // What rewards each clue gives
}

interface RandomizerGameProps {
  game: GameJson;
  gid: string;
  gameModel: any; // The GameModel instance for syncing state
}

export default class RandomizerGame extends Component<RandomizerGameProps, RandomizerState> {
  private client: any;

  constructor(props: RandomizerGameProps) {
    super(props);

    const clues = this.extractClues();
    const rng = new SeededRandom(this.hashString(props.gid));
    const shuffledClues = this.shuffleArray([...clues], rng);
    const rewardAllocations = this.calculateRewardAllocations(clues, rng);

    this.client = new Client(null);

    this.state = {
      clues,
      shuffledClues,
      answers: {},
      feedbackClue: null,
      feedbackType: null,
      rewardAllocations,
    };
  }

  componentDidMount() {
    this.client
      .login('localhost:38281', 'Jack', undefined, undefined)
      .then(() => console.log('Connected to the Archipelago server!'))
      .catch(console.error);
  }

  // Get randomizer state from game (synced across all players)
  get randomizerState() {
    return (
      this.props.game.randomizer || {
        solvedClues: {},
        revealedLetters: {},
        wrongAttempts: {},
        totalWrongAttempts: 0,
      }
    );
  }

  // Hash a string to get a consistent seed
  hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Shuffle array with seeded random
  shuffleArray<T>(array: T[], rng: SeededRandom): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Extract all clues from the game
  extractClues(): ClueData[] {
    const {game} = this.props;
    const clues: ClueData[] = [];
    const {grid, solution, clues: gameClues} = game;

    // Build a map of cell positions for each clue number and direction
    const cluePositions: {
      [key: string]: {r: number; c: number}[];
    } = {};

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell && !cell.black && cell.parents) {
          ['across', 'down'].forEach((dir) => {
            const direction = dir as 'across' | 'down';
            const number = cell.parents![direction];
            if (number) {
              const key = `${direction}-${number}`;
              if (!cluePositions[key]) {
                cluePositions[key] = [];
              }
              cluePositions[key].push({r, c});
            }
          });
        }
      }
    }

    // Build clue objects
    ['across', 'down'].forEach((dir) => {
      const direction = dir as 'across' | 'down';
      gameClues[direction].forEach((text, number) => {
        if (text) {
          const key = `${direction}-${number}`;
          const cells = cluePositions[key] || [];
          const answer = cells.map(({r, c}) => solution[r][c]).join('');

          clues.push({
            id: key,
            direction,
            number,
            text,
            answer,
            cells,
          });
        }
      });
    });

    return clues;
  }

  // Calculate which rewards (letter reveals) each clue unlocks
  calculateRewardAllocations(
    clues: ClueData[],
    rng: SeededRandom
  ): {[clueId: string]: {clueId: string; letterIndex: number}[]} {
    const allocations: {[clueId: string]: {clueId: string; letterIndex: number}[]} = {};

    // Build a list of all possible rewards (each crossed letter)
    const allRewards: {clueId: string; letterIndex: number}[] = [];

    clues.forEach((clue) => {
      clue.cells.forEach((cell, index) => {
        // Find the crossing clue
        const crossingClue = clues.find((otherClue) => {
          if (otherClue.direction === clue.direction) return false;
          return otherClue.cells.some((otherCell) => otherCell.r === cell.r && otherCell.c === cell.c);
        });

        if (crossingClue) {
          // This is a crossed letter, so it's a potential reward
          allRewards.push({clueId: clue.id, letterIndex: index});
        }
      });
    });

    // Shuffle all rewards
    const shuffledRewards = this.shuffleArray(allRewards, rng);

    // Allocate rewards to clues based on how many crossed letters they have
    let rewardIndex = 0;
    clues.forEach((clue) => {
      const numCrossedLetters = clue.cells.filter((cell) => {
        const crossingClue = clues.find((otherClue) => {
          if (otherClue.direction === clue.direction) return false;
          return otherClue.cells.some((otherCell) => otherCell.r === cell.r && otherCell.c === cell.c);
        });
        return !!crossingClue;
      }).length;

      allocations[clue.id] = [];
      for (let i = 0; i < numCrossedLetters && rewardIndex < shuffledRewards.length; i++) {
        allocations[clue.id].push(shuffledRewards[rewardIndex]);
        rewardIndex++;
      }
    });

    return allocations;
  }

  handleAnswerChange = (clueId: string, value: string) => {
    this.setState((state) => ({
      answers: {
        ...state.answers,
        [clueId]: value.toUpperCase(),
      },
    }));
  };

  handleSubmit = (clue: ClueData) => {
    const {answers, rewardAllocations} = this.state;
    const userAnswer = (answers[clue.id] || '').toUpperCase().trim();
    const correctAnswer = clue.answer.toUpperCase().trim();

    const {solvedClues} = this.randomizerState;
    if (solvedClues[clue.id]) {
      // Already solved, don't process
      return;
    }

    const isCorrect = userAnswer === correctAnswer;

    if (isCorrect) {
      // Prepare the revealed letters data
      const revealedLetters: {[clueId: string]: number[]} = {};
      const rewards = rewardAllocations[clue.id] || [];

      rewards.forEach(({clueId, letterIndex}) => {
        if (!revealedLetters[clueId]) {
          revealedLetters[clueId] = [];
        }
        revealedLetters[clueId].push(letterIndex);
      });

      // Submit to game model (syncs to all players)
      this.props.gameModel.randomizerSubmitAnswer(clue.id, true, revealedLetters);

      // Show feedback
      this.setState({
        feedbackClue: clue.id,
        feedbackType: 'correct',
      });

      setTimeout(() => {
        this.setState({feedbackClue: null, feedbackType: null});
      }, 2000);
    } else {
      // Wrong answer - submit to game model
      this.props.gameModel.randomizerSubmitAnswer(clue.id, false, {});

      // Show feedback
      this.setState({
        feedbackClue: clue.id,
        feedbackType: 'incorrect',
      });

      setTimeout(() => {
        this.setState({feedbackClue: null, feedbackType: null});
      }, 2000);
    }
  };

  renderAnswerBox(clue: ClueData) {
    const {answers, feedbackClue, feedbackType} = this.state;
    const {solvedClues, revealedLetters} = this.randomizerState;
    const isSolved = solvedClues[clue.id];
    const revealed = revealedLetters[clue.id] || [];
    const showFeedback = feedbackClue === clue.id;

    const answer = isSolved ? clue.answer : answers[clue.id] || '';

    return (
      <Box className="answer-box">
        {clue.answer.split('').map((letter, index) => {
          const isRevealed = revealed.includes(index);
          const displayLetter = isSolved || isRevealed ? letter : answer[index] || '';

          return (
            <Box
              key={index}
              className={`letter-box ${isRevealed ? 'revealed' : ''} ${isSolved ? 'solved' : ''}`}
            >
              {displayLetter}
            </Box>
          );
        })}
        {showFeedback && (
          <Box className="feedback-icon">
            {feedbackType === 'correct' ? (
              <MdCheckCircle style={{color: 'green', fontSize: 32}} />
            ) : (
              <MdCancel style={{color: 'red', fontSize: 32}} />
            )}
          </Box>
        )}
      </Box>
    );
  }

  render() {
    const {shuffledClues, answers} = this.state;
    const {solvedClues, wrongAttempts, totalWrongAttempts} = this.randomizerState;
    const totalClues = shuffledClues.length;
    const solvedCount = Object.keys(solvedClues).filter((id) => solvedClues[id]).length;

    return (
      <div className="randomizer-game">
        <Box className="randomizer-header" p={2}>
          <Typography variant="h4">Crossword Randomizer</Typography>
          <Box display="flex" style={{gap: '16px', marginTop: '16px'}}>
            <Chip label={`Solved: ${solvedCount} / ${totalClues}`} color="primary" />
            <Chip label={`Wrong Attempts: ${totalWrongAttempts}`} color="secondary" />
          </Box>
          <Typography variant="body2" color="textSecondary" style={{marginTop: '8px'}}>
            Solve clues to earn letter reveals in other clues. Clues are in random order.
          </Typography>
        </Box>

        <Box className="clues-container" p={2}>
          {shuffledClues.map((clue) => {
            const isSolved = solvedClues[clue.id];
            const attempts = wrongAttempts[clue.id] || 0;

            return (
              <Paper key={clue.id} className="clue-card" elevation={2}>
                <Box p={2}>
                  <Typography variant="body1" className="clue-text">
                    {clue.text}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {clue.answer.length} letters, {clue.direction}
                    {attempts > 0 && ` • ${attempts} wrong attempt${attempts > 1 ? 's' : ''}`}
                  </Typography>

                  {this.renderAnswerBox(clue)}

                  {!isSolved && (
                    <Box display="flex" style={{marginTop: '16px', gap: '8px'}}>
                      <TextField
                        variant="outlined"
                        size="small"
                        fullWidth
                        placeholder="Enter answer"
                        value={answers[clue.id] || ''}
                        onChange={(e) => this.handleAnswerChange(clue.id, e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            this.handleSubmit(clue);
                          }
                        }}
                        disabled={isSolved}
                      />
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => this.handleSubmit(clue)}
                        disabled={isSolved || !answers[clue.id]}
                      >
                        Submit
                      </Button>
                    </Box>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </div>
    );
  }
}
