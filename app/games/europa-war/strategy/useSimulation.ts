"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SimulationController, type SimulationWorker } from "./simulation";
import { createSimulationWorker } from "./simulation-worker";
import {
  reportSimulationWorkerAssets,
  reportSimulationWorkerError,
} from "./simulation-assets";
import type { World } from "./types";

// The namespace form is recognized by Webpack's custom worker parser.
const simulationWorker = { create: createSimulationWorker };

export function useSimulation(onError: (message: string) => void) {
  const [world, setWorldState] = useState<World | null>(null);
  const [paused, setPausedState] = useState(true);
  const [speed, setSpeedState] = useState(1);
  const current = useRef<World | null>(null);
  const pausedRef = useRef(true);
  const speedRef = useRef(1);
  const onErrorRef = useRef(onError);
  const controller = useRef<SimulationController | null>(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const simulation = new SimulationController({
      createWorker: () =>
        simulationWorker.create(
          new URL("./simulation.worker.ts", import.meta.url),
        ) as unknown as SimulationWorker,
      canRun: () => !document.hidden,
      onWorld: (next) => {
        current.current = next;
        setWorldState(next);
      },
      onError: (message) => {
        pausedRef.current = true;
        setPausedState(true);
        onErrorRef.current(message);
        reportSimulationWorkerError();
      },
      onAssets: reportSimulationWorkerAssets,
    });
    controller.current = simulation;
    simulation.setWorld(current.current);
    simulation.setSpeed(speedRef.current);
    simulation.initialize();
    simulation.setRunning(!pausedRef.current);
    return () => {
      simulation.dispose();
      if (controller.current === simulation) controller.current = null;
    };
  }, []);

  const setWorld = useCallback((next: World) => {
    current.current = next;
    controller.current?.setWorld(next);
    setWorldState(next);
  }, []);

  const setPaused = useCallback(
    (value: boolean | ((paused: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(pausedRef.current) : value;
      pausedRef.current = next;
      controller.current?.setRunning(!next);
      setPausedState(next);
    },
    [],
  );

  const setSpeed = useCallback((next: number) => {
    speedRef.current = next;
    controller.current?.setSpeed(next);
    setSpeedState(next);
  }, []);

  return { world, setWorld, current, paused, setPaused, speed, setSpeed };
}
