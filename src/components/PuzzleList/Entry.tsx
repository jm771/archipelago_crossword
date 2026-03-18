import React, {Component} from 'react';
import _ from 'lodash';
import Flex from 'react-flexview';
import {MdRadioButtonUnchecked, MdCheckCircle} from 'react-icons/md';
import {GiCrossedSwords} from 'react-icons/gi';
import ModeSelectionDialog from './ModeSelectionDialog';

export interface EntryProps {
  info: {
    type: string;
  };
  title: string;
  author: string;
  pid: string;
  status: 'started' | 'solved' | undefined;
  stats: {
    numSolves?: number;
    solves?: Array<any>;
  };
  fencing?: boolean;
}

interface EntryState {
  dialogOpen: boolean;
}

export default class Entry extends Component<EntryProps, EntryState> {
  constructor(props: EntryProps) {
    super(props);
    this.state = {
      dialogOpen: false,
    };
  }

  handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    this.setState({dialogOpen: true});
  };

  handleCloseDialog = () => {
    this.setState({dialogOpen: false});
  };

  handleMouseLeave = () => {};

  get size() {
    const {type} = this.props.info;
    if (type === 'Daily Puzzle') {
      return 'Standard';
    }
    if (type === 'Mini Puzzle') {
      return 'Mini';
    }
    return 'Puzzle'; // shouldn't get here???
  }

  render() {
    const {title, author, pid, status, stats, fencing} = this.props;
    const numSolvesOld = _.size(stats?.solves || []);
    const numSolves = numSolvesOld + (stats?.numSolves || 0);
    const displayName = _.compact([author.trim(), this.size]).join(' | ');
    return (
      <>
        <div style={{textDecoration: 'none', color: 'initial', cursor: 'pointer'}} onClick={this.handleClick}>
          <Flex className="entry" column onMouseLeave={this.handleMouseLeave}>
            <Flex className="entry--top--left">
              <Flex grow={0}>
                <p
                  style={{textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden'}}
                  title={displayName}
                >
                  {displayName}
                </p>
              </Flex>
              <Flex>
                {status === 'started' && <MdRadioButtonUnchecked className="entry--icon" />}
                {status === 'solved' && <MdCheckCircle className="entry--icon" />}
                {status !== 'started' && status !== 'solved' && fencing && (
                  <GiCrossedSwords className="entry--icon fencing" />
                )}
              </Flex>
            </Flex>
            <Flex className="entry--main">
              <Flex grow={0}>
                <p style={{textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden'}} title={title}>
                  {title}
                </p>
              </Flex>
            </Flex>
            <Flex className="entry--details">
              <p>
                Solved {numSolves} {numSolves === 1 ? 'time' : 'times'}
              </p>
            </Flex>
          </Flex>
        </div>
        <ModeSelectionDialog
          open={this.state.dialogOpen}
          onClose={this.handleCloseDialog}
          pid={pid}
          fencing={fencing}
        />
      </>
    );
  }
}
