"use client";

import { useState, useCallback } from 'react';
import { analyzeFitFile, commitValidation, type RideSummary } from '@/lib/validation';
import type { IGameEngine } from '@/lib/engine/IGameEngine';

interface Props {
  sessionId: string;
  gameEngine: IGameEngine | null;
  onRideParsed?: (path: any) => void;
  onValidated?: () => void;
  onRideCancelled?: () => void;
}

export default function ApDropzone({ sessionId, gameEngine, onRideParsed, onValidated, onRideCancelled }: Props) {
  const [isHovering, setIsHovering] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<RideSummary | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);

    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.fit')) {
        setFile(droppedFile);
        setSummary(null);
        setValidationMessages([]);
      } else {
        alert('Please drop a valid .fit file.');
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setSummary(null);
      setValidationMessages([]);
    }
  };

  const analyzeFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const result = await analyzeFitFile(file, sessionId);
      setSummary(result);
      if (onRideParsed) onRideParsed({ path: result.path });
    } catch (err: any) {
      setValidationMessages([`Error: ${err.message || err}`]);
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmValidation = async () => {
    if (!summary || !gameEngine) return;

    setIsProcessing(true);
    try {
      const msgs = await commitValidation(summary.newlyCheckedNodes, gameEngine);
      setValidationMessages(msgs);
      if (onValidated) onValidated();
      setSummary(null);
      setFile(null);
    } catch (err: any) {
      setValidationMessages([`Error: ${err.message || err}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const cancel = () => {
    setSummary(null);
    setFile(null);
    setValidationMessages([]);
    if (onRideCancelled) onRideCancelled();
  };

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  return (
    <div className="bg-neutral-800 p-4 rounded-lg shadow-lg h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-bold mb-3 text-orange-500">Validate Check(s)</h2>

      {!file && !summary ? (
        <label
          htmlFor="file-upload"
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex-1 flex flex-col items-center justify-center ${
            isHovering ? 'border-orange-500 bg-neutral-700' : 'border-neutral-600 hover:border-orange-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <svg className="w-8 h-8 text-neutral-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-neutral-400">
            <span className="font-semibold text-white">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-neutral-500 mt-1">Only .fit files are supported</p>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".fit"
            onChange={handleFileSelect}
          />
        </label>
      ) : file && !summary ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-700 rounded-lg">
          <span className="text-sm text-white font-medium mb-4">{file.name}</span>
          <div className="flex space-x-3">
            <button
              onClick={analyzeFile}
              disabled={isProcessing}
              className="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-6 rounded-lg transition disabled:opacity-50"
            >
              {isProcessing ? 'Analyzing…' : 'Analyze Ride'}
            </button>
            <button
              onClick={cancel}
              disabled={isProcessing}
              className="bg-neutral-600 hover:bg-neutral-500 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : summary ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
              <p className="text-[10px] uppercase text-neutral-500 font-bold">Distance</p>
              <p className="text-sm text-white font-mono">
                {(summary.stats.distanceMeters / 1000).toFixed(2)} km
              </p>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
              <p className="text-[10px] uppercase text-neutral-500 font-bold">Elevation</p>
              <p className="text-sm text-white font-mono">
                {Math.round(summary.stats.elevationGainMeters)} m
              </p>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
              <p className="text-[10px] uppercase text-neutral-500 font-bold">Time</p>
              <p className="text-sm text-white font-mono">{formatTime(summary.stats.movingTimeSeconds)}</p>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
              <p className="text-[10px] uppercase text-neutral-500 font-bold">Avg Speed</p>
              <p className="text-sm text-white font-mono">{summary.stats.avgSpeedKph.toFixed(1)} km/h</p>
            </div>

            {summary.stats.avgPower !== undefined && (
              <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
                <p className="text-[10px] uppercase text-neutral-500 font-bold">Avg Power</p>
                <p className="text-sm text-white font-mono">{Math.round(summary.stats.avgPower)} W</p>
              </div>
            )}
            {summary.stats.avgHR !== undefined && (
              <div className="bg-neutral-900 p-2 rounded border border-neutral-700">
                <p className="text-[10px] uppercase text-neutral-500 font-bold">Avg HR</p>
                <p className="text-sm text-white font-mono">{Math.round(summary.stats.avgHR)} bpm</p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto mb-4 min-h-[100px]">
            <p className="text-xs font-bold text-neutral-400 mb-1">
              Locations to clear ({summary.newlyCheckedNodes.length}):
            </p>
            {summary.newlyCheckedNodes.length > 0 ? (
              <div className="space-y-1">
                {summary.newlyCheckedNodes.map((node) => (
                  <div
                    key={node.id}
                    className="p-2 bg-neutral-900 rounded border border-neutral-700 text-xs text-green-400 flex justify-between"
                  >
                    <span>Check #{node.ap_location_id}</span>
                    <span className="text-neutral-500 font-mono">
                      [{node.lat.toFixed(4)}, {node.lon.toFixed(4)}]
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 italic p-2 bg-neutral-900 rounded">
                No locations reached in this ride.
              </p>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={confirmValidation}
              disabled={isProcessing || summary.newlyCheckedNodes.length === 0}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition disabled:opacity-50"
            >
              {isProcessing ? 'Processing…' : 'Confirm & Send'}
            </button>
            <button
              onClick={cancel}
              disabled={isProcessing}
              className="bg-neutral-600 hover:bg-neutral-500 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {validationMessages.length > 0 && (
        <div className="mt-3 space-y-1 overflow-y-auto max-h-24">
          {validationMessages.map((msg, i) => (
            <div key={i} className="p-2 bg-neutral-900 rounded border border-neutral-700 text-xs text-neutral-200">
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
