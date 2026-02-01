import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MascotLayout } from './ui/layouts';
import { MascotContainer, SpriteCanvas, ChatBubble, EmotionIndicator } from './ui/components/mascot';
import { useGateway, useEmotion, useIdleDetection } from './hooks';
import './styles/globals.css';

const SPRITE_PATH = './sprites/doraemon';

const App = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const { isConnected, connect } = useGateway();
  const { current: emotion } = useEmotion();

  useIdleDetection();

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    if (!isConnected) {
      setMessage('Connecting...');
      setIsThinking(true);
    } else {
      setMessage('Hello!');
      setIsThinking(false);
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  const spriteForEmotion = (e: typeof emotion): string => {
    const map: Record<typeof emotion, string> = {
      neutral: 'idle',
      happy: 'happy',
      sad: 'sad',
      excited: 'wave',
      thinking: 'think',
      confused: 'surprised',
      sleepy: 'sleep',
      surprised: 'surprised',
    };
    return `${SPRITE_PATH}/${map[e]}.png`;
  };

  return (
    <MascotLayout>
      <MascotContainer>
        <div class="relative">
          {message && (
            <ChatBubble message={message} isThinking={isThinking} />
          )}
          <SpriteCanvas imageSrc={spriteForEmotion(emotion)} />
          <EmotionIndicator
            emotion={emotion}
            className="absolute bottom-1 right-1"
          />
        </div>
      </MascotContainer>
    </MascotLayout>
  );
};

render(<App />, document.getElementById('app')!);
