import { useMemo, useState } from "react";
import isEqual from "lodash.isequal";
import { TransactionWithNotes } from "utils/types";

type UndoRedoType = {
    transactions: TransactionWithNotes[];
    selectedKeys: Set<string>;
  };

export default function useUndoRedoState(init: UndoRedoType) {
  const [states, setStates] = useState([init]); // Used to store history of all states
  const [index, setIndex] = useState(0); // Index of current state within `states`
  const history = useMemo(() => states[index], [states, index]); // Current state
  const setHistory = (value: any) => {
    // Use lodash isEqual to check for deep equality
    // If state has not changed, return to avoid triggering a re-render
    if (isEqual(history, value)) {
      return;
    }
    const copy = states.slice(0, index + 1); // This removes all future (redo) states after current index
    copy.push(value);
    setStates(copy);
    setIndex(copy.length - 1);
  };
  // Clear all state history
  const resetHistory = (init: any) => {
    setIndex(0);
    setStates([init]);
  };
  // Allows you to go back (undo) N steps
  const goBack = (steps = 1) => {
    setIndex(Math.max(0, Number(index) - (Number(steps) || 1)));
  };
  // Allows you to go forward (redo) N steps
  const goForward = (steps = 1) => {
    setIndex(Math.min(states.length - 1, Number(index) + (Number(steps) || 1)));
  };
  return {
    history,
    setHistory,
    resetHistory,
    index,
    lastIndex: states.length - 1,
    goBack,
    goForward,
  };
}
