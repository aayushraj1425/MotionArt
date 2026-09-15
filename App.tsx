import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet } from 'react-native';

import { HomeScreen } from './src/screens/HomeScreen';
import { ProcessingScreen } from './src/screens/ProcessingScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { theme } from './src/theme';
import type { PickedVideo, ProcessResult } from './src/types';

type Phase = 'home' | 'processing' | 'result';

/**
 * Root: a tiny three-phase state machine. Each phase owns one screen and the
 * app carries only the data that flows between them (the picked video, then
 * the generated result).
 */
export default function App() {
  const [phase, setPhase] = useState<Phase>('home');
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

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
          onPicked={(picked) => {
            setVideo(picked);
            setPhase('processing');
          }}
        />
      )}

      {phase === 'processing' && video && (
        <ProcessingScreen
          video={video}
          onDone={(r) => {
            setResult(r);
            setPhase('result');
          }}
          onError={(message) => {
            Alert.alert('Motion Art', message);
            reset();
          }}
        />
      )}

      {phase === 'result' && result && <ResultScreen result={result} onRestart={reset} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
