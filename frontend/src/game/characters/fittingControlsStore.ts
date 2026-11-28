import { create } from "zustand";

const TURN_STEP = Math.PI / 12;

export const useFittingTurnStore = create(() => ({
  characterYaw: 0,
  garageYaw: 0,
  dragging: false,
  suppressClickUntil: 0,
}));

export const turnCharacter = (direction: -1 | 1) =>
  useFittingTurnStore.setState(state => ({ characterYaw: state.characterYaw + direction * TURN_STEP }));

export const turnGarage = (direction: -1 | 1) =>
  useFittingTurnStore.setState(state => ({ garageYaw: state.garageYaw + direction * TURN_STEP }));
