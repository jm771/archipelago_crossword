import React, {Component} from 'react';
import {GameJson} from '../../shared/types';
import {Paper, TextField, Button, Typography, Box, Chip} from '@material-ui/core';
import {MdCheckCircle, MdCancel} from 'react-icons/md';
import './RandomizerGame.css';

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
  answers: {[clueId: string]: string}; // User's current answer for each clue
  solvedClues: Set<string>; // IDs of correctly solved clues
  revealedLetters: {[clueId: string]: Set<number>}; // Which letter indices are revealed for each clue
  wrongAttempts: {[clueId: string]: number}; // Count of wrong submissions per clue
  totalWrongAttempts: number;
  feedbackClue: string | null; // Which clue is showing feedback
  feedbackType: 'correct' | 'incorrect' | null;
  rewardAllocations: {[clueId: string]: {clueId: string; letterIndex: number}[]}; // What rewards each clue gives
}

interface RandomizerGameProps {
  game: GameJson;
  gid: string;
}

export default class RandomizerGame extends Component<RandomizerGameProps, RandomizerState> {
  constructor(props: RandomizerGameProps) {
    super(props);

    const clues = this.extractClues();
    const rng = new SeededRandom(this.hashString(props.gid));
    const shuffledClues = this.shuffleArray([...clues], rng);
    const rewardAllocations = this.calculateRewardAllocations(clues, rng);

    this.state = {
      clues,
      shuffledClues,
      answers: {},
      solvedClues: new Set(),
      revealedLetters: {},
      wrongAttempts: {},
      totalWrongAttempts: 0,
      feedbackClue: null,
      feedbackType: null,
      rewardAllocations,
    };
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
    const {answers, solvedClues, revealedLetters, wrongAttempts, rewardAllocations} = this.state;
    const userAnswer = (answers[clue.id] || '').toUpperCase().trim();
    const correctAnswer = clue.answer.toUpperCase().trim();

    if (solvedClues.has(clue.id)) {
      // Already solved, don't process
      return;
    }

    if (userAnswer === correctAnswer) {
      // Correct answer!
      const newSolvedClues = new Set(solvedClues);
      newSolvedClues.add(clue.id);

      const newRevealedLetters = {...revealedLetters};

      // Reveal the rewards allocated to this clue
      const rewards = rewardAllocations[clue.id] || [];
      rewards.forEach(({clueId, letterIndex}) => {
        if (!newRevealedLetters[clueId]) {
          newRevealedLetters[clueId] = new Set();
        }
        newRevealedLetters[clueId].add(letterIndex);
      });

      this.setState({
        solvedClues: newSolvedClues,
        revealedLetters: newRevealedLetters,
        feedbackClue: clue.id,
        feedbackType: 'correct',
      });

      setTimeout(() => {
        this.setState({feedbackClue: null, feedbackType: null});
      }, 2000);
    } else {
      // Wrong answer
      const newWrongAttempts = {...wrongAttempts};
      newWrongAttempts[clue.id] = (newWrongAttempts[clue.id] || 0) + 1;

      this.setState({
        wrongAttempts: newWrongAttempts,
        totalWrongAttempts: this.state.totalWrongAttempts + 1,
        feedbackClue: clue.id,
        feedbackType: 'incorrect',
      });

      setTimeout(() => {
        this.setState({feedbackClue: null, feedbackType: null});
      }, 2000);
    }
  };

  renderAnswerBox(clue: ClueData) {
    const {answers, solvedClues, revealedLetters, feedbackClue, feedbackType} = this.state;
    const isSolved = solvedClues.has(clue.id);
    const revealed = revealedLetters[clue.id] || new Set();
    const showFeedback = feedbackClue === clue.id;

    const answer = isSolved ? clue.answer : answers[clue.id] || '';

    return (
      <Box className="answer-box">
        {clue.answer.split('').map((letter, index) => {
          const isRevealed = revealed.has(index);
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
    const {shuffledClues, solvedClues, wrongAttempts, totalWrongAttempts, answers} = this.state;
    const totalClues = shuffledClues.length;
    const solvedCount = solvedClues.size;

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
            const isSolved = solvedClues.has(clue.id);
            const attempts = wrongAttempts[clue.id] || 0;

            return (
              <Paper key={clue.id} className="clue-card" elevation={2}>
                <Box p={2}>
                  <Typography variant="body1" className="clue-text">
                    {clue.text}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {clue.answer.length} letters{' '}
                    {attempts > 0 && `• ${attempts} wrong attempt${attempts > 1 ? 's' : ''}`}
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
