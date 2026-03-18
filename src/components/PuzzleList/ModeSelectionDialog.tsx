import React from 'react';
import {useHistory} from 'react-router-dom';
import {Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography} from '@material-ui/core';
import {makeStyles} from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  dialog: {
    minWidth: 400,
  },
  modeButton: {
    margin: theme.spacing(1),
    padding: theme.spacing(2),
    fontSize: '1.1rem',
    textTransform: 'none',
  },
  description: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  dialogContent: {
    paddingTop: theme.spacing(2),
  },
}));

interface ModeSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  pid: string;
  fencing?: boolean;
}

const ModeSelectionDialog: React.FC<ModeSelectionDialogProps> = ({open, onClose, pid, fencing}) => {
  const classes = useStyles();
  const history = useHistory();

  const handleModeSelect = (mode: 'standard' | 'randomizer') => {
    const baseUrl = `/beta/play/${pid}`;
    const params = new URLSearchParams();

    if (fencing) {
      params.append('fencing', '1');
    }

    if (mode === 'randomizer') {
      params.append('mode', 'randomizer');
    }

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    history.push(url);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} classes={{paper: classes.dialog}}>
      <DialogTitle>Select Game Mode</DialogTitle>
      <DialogContent className={classes.dialogContent}>
        <Typography variant="body1" className={classes.description}>
          Choose how you want to play this crossword puzzle:
        </Typography>

        <Button
          variant="contained"
          color="primary"
          fullWidth
          className={classes.modeButton}
          onClick={() => handleModeSelect('standard')}
        >
          Standard Mode
        </Button>
        <Typography variant="body2" color="textSecondary" align="center">
          Traditional crossword with grid and clues
        </Typography>

        <div style={{marginTop: 24}}>
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            className={classes.modeButton}
            onClick={() => handleModeSelect('randomizer')}
          >
            Randomizer Mode
          </Button>
          <Typography variant="body2" color="textSecondary" align="center">
            Archipelago-style randomizer - solve clues to unlock letter reveals
          </Typography>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="default">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModeSelectionDialog;
