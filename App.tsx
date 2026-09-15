import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, SafeAreaView, StyleSheet } from 'react-native';

import { HomeScreen } from './src/screens/HomeScreen';
import { ProcessingScreen } from './src/screens/ProcessingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { theme } from './src/theme';
import { DEFAULT_OPTIONS, type AnimeOptions, type PickedVideo, type ProcessResult, type ProcessingEngine, type PythonConnection } from './src/types';

type Phase = 'home' | 'processing' | 'result';

/**
 * Root: a tiny three-phase state machine. Each phase owns one screen and the
 * app carries only the data that flows between them (the picked video, then
 * the generated result).
 */
export default function App() {
  const [options, setOptions] = useState<AnimeOptions>(DEFAULT_OPTIONS);
  const [engine, setEngine] = useState<ProcessingEngine>('python');
  const [connection, setConnection] = useState<PythonConnection>({ url: '', code: '' });
  const [phase, setPhase] = useState<Phase>('home');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  useEffect(() => () => {
    if (result) void FileSystem.deleteAsync(result.cacheDirectory ?? result.videoUri, { idempotent: true }).catch(() => {});
  }, [result]);

  const reset = () => {
    setPhase('home');
    setVideo(null);
    setResult(null);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {phase === 'home' && (
        <HomeScreen
          engine={engine} onEngineChange={setEngine}
          connection={connection} onConnectionChange={setConnection}
          video={video}
          options={options}
          onOptionsChange={setOptions}
          onPicked={(picked) => {
            setResult(null);
            setVideo(picked);
            setPhase('processing');
          }}
        />
      )}

      {phase === 'processing' && video && (
        <ProcessingScreen
          engine={engine} connection={connection}
          video={video}
          options={options}
          onDone={(r) => {
            setResult(r);
            setPhase('result');
          }}
          onError={(message) => {
            Alert.alert('Motion Art', message);
            setPhase('home');
          }}
        />
      )}

      {phase === 'result' && result && <ResultScreen result={result} onRestart={reset} onAdjust={() => setPhase('home')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
