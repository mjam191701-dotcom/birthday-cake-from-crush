import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Candle } from "./models/candle";
import { Cake } from "./models/cake";
import { Table } from "./models/table";
import { PictureFrame } from "./models/pictureFrame";
import { Fireworks } from "./components/Fireworks";
import { BirthdayCard } from "./components/BirthdayCard";

import "./App.css";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// 18 Reasons I Love You
const LOVE_REASONS = [
  "Your smile lights up my world",
  "You make me laugh every day",
  "Your kindness inspires me",
  "You're incredibly smart and talented",
  "You always know how to cheer me up",
  "Your hugs feel like home",
  "You believe in me",
  "You're my best friend",
  "Your laugh is my favorite sound",
  "You make every day an adventure",
  "You're beautiful inside and out",
  "You understand me like no one else",
  "Your dreams excite me",
  "You're patient and caring",
  "You make me want to be better",
  "You're always there for me",
  "You complete me",
  "I can't imagine life without you"
];

type AnimatedSceneProps = {
  isPlaying: boolean;
  onBackgroundFadeChange?: (opacity: number) => void;
  onEnvironmentProgressChange?: (progress: number) => void;
  candlesLit: boolean[];
  onAnimationComplete?: () => void;
  cards: ReadonlyArray<BirthdayCardConfig>;
  activeCardId: string | null;
  onToggleCard: (id: string) => void;
  hoveredCandleIndex: number | null;
  onCandleHover: (index: number | null) => void;
  onCandleClick: (index: number) => void;
};

const CAKE_START_Y = 10;
const CAKE_END_Y = 0;
const CAKE_DESCENT_DURATION = 3;

const TABLE_START_Z = 30;
const TABLE_END_Z = 0;
const TABLE_SLIDE_DURATION = 0.7;
const TABLE_SLIDE_START = CAKE_DESCENT_DURATION - TABLE_SLIDE_DURATION - 0.1;

const CANDLE_START_Y = 5;
const CANDLE_END_Y = 0;
const CANDLE_DROP_DURATION = 1.2;
const CANDLE_DROP_START =
  Math.max(CAKE_DESCENT_DURATION, TABLE_SLIDE_START + TABLE_SLIDE_DURATION) +
  1.0;

const totalAnimationTime = CANDLE_DROP_START + CANDLE_DROP_DURATION;

const ORBIT_TARGET = new Vector3(0, 1, 0);
const ORBIT_INITIAL_RADIUS = 3;
const ORBIT_INITIAL_HEIGHT = 1;
const ORBIT_INITIAL_AZIMUTH = Math.PI / 2;
const ORBIT_MIN_DISTANCE = 2;
const ORBIT_MAX_DISTANCE = 8;
const ORBIT_MIN_POLAR = Math.PI * 0;
const ORBIT_MAX_POLAR = Math.PI / 2;

const BACKGROUND_FADE_DURATION = 1;
const BACKGROUND_FADE_OFFSET = 0;
const BACKGROUND_FADE_END = Math.max(
  CANDLE_DROP_START - BACKGROUND_FADE_OFFSET,
  BACKGROUND_FADE_DURATION
);
const BACKGROUND_FADE_START = Math.max(
  BACKGROUND_FADE_END - BACKGROUND_FADE_DURATION,
  0
);

const TYPED_LINES = [
  "> my love",
  "...",
  "> today is your 18th birthday",
  "...",
  "> so i made you this",
  "...",
  "💖 happy birthday gorgeous 💖"
];
const TYPED_CHAR_DELAY = 100;
const POST_TYPING_SCENE_DELAY = 1000;
const CURSOR_BLINK_INTERVAL = 480;

type BirthdayCardConfig = {
  id: string;
  image: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

const BIRTHDAY_CARDS: ReadonlyArray<BirthdayCardConfig> = [
  {
    id: "confetti",
    image: "/card.png",
    position: [1, 0.081, -2],
    rotation: [-Math.PI / 2 , 0, Math.PI / 3],
  }
];

// Calculate positions for 18 candles in a circle
const getCandlePositions = (): [number, number, number][] => {
  return Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 0.35;
    return [
      Math.cos(angle) * radius,
      1.1,
      Math.sin(angle) * radius
    ];
  });
};

const CANDLE_POSITIONS = getCandlePositions();

function AnimatedScene({
  isPlaying,
  onBackgroundFadeChange,
  onEnvironmentProgressChange,
  candlesLit,
  onAnimationComplete,
  cards,
  activeCardId,
  onToggleCard,
  hoveredCandleIndex,
  onCandleHover,
  onCandleClick,
}: AnimatedSceneProps) {
  const cakeGroup = useRef<Group>(null);
  const tableGroup = useRef<Group>(null);
  const candlesGroup = useRef<Group>(null);
  const animationStartRef = useRef<number | null>(null);
  const hasPrimedRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const backgroundOpacityRef = useRef(1);
  const environmentProgressRef = useRef(0);

  useEffect(() => {
    onBackgroundFadeChange?.(backgroundOpacityRef.current);
    onEnvironmentProgressChange?.(environmentProgressRef.current);
  }, [onBackgroundFadeChange, onEnvironmentProgressChange]);

  const emitBackgroundOpacity = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - backgroundOpacityRef.current) > 0.005) {
      backgroundOpacityRef.current = clamped;
      onBackgroundFadeChange?.(clamped);
    }
  };

  const emitEnvironmentProgress = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - environmentProgressRef.current) > 0.005) {
      environmentProgressRef.current = clamped;
      onEnvironmentProgressChange?.(clamped);
    }
  };

  useFrame(({ clock }) => {
    const cake = cakeGroup.current;
    const table = tableGroup.current;
    const candles = candlesGroup.current;

    if (!cake || !table || !candles) {
      return;
    }

    if (!hasPrimedRef.current) {
      cake.position.set(0, CAKE_START_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_START_Z);
      table.rotation.set(0, 0, 0);
      candles.position.set(0, CANDLE_START_Y, 0);
      candles.visible = false;
      hasPrimedRef.current = true;
    }

    if (!isPlaying) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
      animationStartRef.current = null;
      hasCompletedRef.current = false;
      completionNotifiedRef.current = false;
      return;
    }

    if (hasCompletedRef.current) {
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
      return;
    }

    if (animationStartRef.current === null) {
      animationStartRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - animationStartRef.current;
    const clampedElapsed = clamp(elapsed, 0, totalAnimationTime);

    const cakeProgress = clamp(clampedElapsed / CAKE_DESCENT_DURATION, 0, 1);
    const cakeEase = easeOutCubic(cakeProgress);
    cake.position.y = lerp(CAKE_START_Y, CAKE_END_Y, cakeEase);
    cake.position.x = 0;
    cake.position.z = 0;
    cake.rotation.y = cakeEase * Math.PI * 2;
    cake.rotation.x = 0;
    cake.rotation.z = 0;

    let tableZ = TABLE_START_Z;
    if (clampedElapsed >= TABLE_SLIDE_START) {
      const tableProgress = clamp(
        (clampedElapsed - TABLE_SLIDE_START) / TABLE_SLIDE_DURATION,
        0,
        1
      );
      const tableEase = easeOutCubic(tableProgress);
      tableZ = lerp(TABLE_START_Z, TABLE_END_Z, tableEase);
    }
    table.position.set(0, 0, tableZ);
    table.rotation.set(0, 0, 0);

    if (clampedElapsed >= CANDLE_DROP_START) {
      if (!candles.visible) {
        candles.visible = true;
      }
      const candleProgress = clamp(
        (clampedElapsed - CANDLE_DROP_START) / CANDLE_DROP_DURATION,
        0,
        1
      );
      const candleEase = easeOutCubic(candleProgress);
      candles.position.y = lerp(CANDLE_START_Y, CANDLE_END_Y, candleEase);
    } else {
      candles.visible = false;
      candles.position.set(0, CANDLE_START_Y, 0);
    }

    if (clampedElapsed < BACKGROUND_FADE_START) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
    } else {
      const fadeProgress = clamp(
        (clampedElapsed - BACKGROUND_FADE_START) / BACKGROUND_FADE_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(fadeProgress);
      const backgroundOpacity = 1 - eased;
      emitBackgroundOpacity(backgroundOpacity);
      emitEnvironmentProgress(1 - backgroundOpacity);
    }

    const animationDone = clampedElapsed >= totalAnimationTime;
    if (animationDone) {
      cake.position.set(0, CAKE_END_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_END_Z);
      candles.position.set(0, CANDLE_END_Y, 0);
      candles.visible = true;
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      hasCompletedRef.current = true;
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
    }
  });

  return (
    <>
      <group ref={tableGroup}>
        <Table />
        <PictureFrame
          image="/frame2.jpg"
          position={[0, 0.735, 3]}
          rotation={[0, 5.6, 0]}
          scale={0.75}
        />
        <PictureFrame
          image="/frame3.jpg"
          position={[0, 0.735, -3]}
          rotation={[0, 4.0, 0]}
          scale={0.75}
        />
        <PictureFrame
          image="/frame4.jpg"
          position={[-1.5, 0.735, 2.5]}
          rotation={[0, 5.4, 0]}
          scale={0.75}
        />
        <PictureFrame
          image="/frame1.jpg"
          position={[-1.5, 0.735, -2.5]}
          rotation={[0, 4.2, 0]}
          scale={0.75}
        />
        {cards.map((card) => (
          <BirthdayCard
            key={card.id}
            id={card.id}
            image={card.image}
            tablePosition={card.position}
            tableRotation={card.rotation}
            isActive={activeCardId === card.id}
            onToggle={onToggleCard}
          />
        ))}
      </group>
      <group ref={cakeGroup}>
        <Cake />
      </group>
      <group ref={candlesGroup}>
        {CANDLE_POSITIONS.map((position, index) => (
          <group 
            key={index}
            position={position}
          >
            <mesh
              onPointerOver={() => onCandleHover(index)}
              onPointerOut={() => onCandleHover(null)}
              onClick={() => onCandleClick(index)}
              visible={false}
            >
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
            <Candle isLit={candlesLit[index]} scale={0.15} />
          </group>
        ))}
      </group>
    </>
  );
}

function ConfiguredOrbitControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const offset = new Vector3(
      Math.sin(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS,
      ORBIT_INITIAL_HEIGHT,
      Math.cos(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS
    );
    const cameraPosition = ORBIT_TARGET.clone().add(offset);
    camera.position.copy(cameraPosition);
    camera.lookAt(ORBIT_TARGET);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(ORBIT_TARGET);
      controls.update();
    }
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
    />
  );
}

type EnvironmentBackgroundControllerProps = {
  intensity: number;
};

function EnvironmentBackgroundController({
  intensity,
}: EnvironmentBackgroundControllerProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if ("backgroundIntensity" in scene) {
      (scene as typeof scene & { backgroundIntensity: number }).backgroundIntensity =
        intensity;
    }
  }, [scene, intensity]);

  return null;
}


export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [environmentProgress, setEnvironmentProgress] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false);
  const [candlesLit, setCandlesLit] = useState<boolean[]>(Array(18).fill(true));
  const [fireworksActive, setFireworksActive] = useState<boolean>(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  // Time sync effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Time zones - Change 'America/Chicago' to your timezone
  const yourTimeZone = 'America/Chicago';
  const herTimeZone = 'Asia/Kolkata'; // India timezone

  const yourTime = currentTime.toLocaleTimeString('en-US', {
    timeZone: yourTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const herTime = currentTime.toLocaleTimeString('en-US', {
    timeZone: herTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  useEffect(() => {
    const audio = new Audio("/music.mp3");
    audio.loop = true;
    audio.preload = "auto";
    backgroundAudioRef.current = audio;
    return () => {
      audio.pause();
      backgroundAudioRef.current = null;
    };
  }, []);

  const playBackgroundMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio) {
      return;
    }
    if (!audio.paused) {
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // ignore play errors
    });
  }, []);

  const typingComplete = currentLineIndex >= TYPED_LINES.length;
  const typedLines = useMemo(() => {
    if (TYPED_LINES.length === 0) {
      return [""];
    }

    return TYPED_LINES.map((line, index) => {
      if (typingComplete || index < currentLineIndex) {
        return line;
      }
      if (index === currentLineIndex) {
        return line.slice(0, Math.min(currentCharIndex, line.length));
      }
      return "";
    });
  }, [currentCharIndex, currentLineIndex, typingComplete]);

  const cursorLineIndex = typingComplete
    ? Math.max(typedLines.length - 1, 0)
    : currentLineIndex;
  const cursorTargetIndex = Math.max(
    Math.min(cursorLineIndex, typedLines.length - 1),
    0
  );

  useEffect(() => {
    if (!hasStarted) {
      setCurrentLineIndex(0);
      setCurrentCharIndex(0);
      setSceneStarted(false);
      setCandlesLit(Array(18).fill(true));
      setFireworksActive(false);
      setHasAnimationCompleted(false);
      setShowVideo(false);
      return;
    }

    if (typingComplete) {
      if (!sceneStarted) {
        const handle = window.setTimeout(() => {
          setSceneStarted(true);
        }, POST_TYPING_SCENE_DELAY);
        return () => window.clearTimeout(handle);
      }
      return;
    }

    const currentLine = TYPED_LINES[currentLineIndex] ?? "";
    const handle = window.setTimeout(() => {
      if (currentCharIndex < currentLine.length) {
        setCurrentCharIndex((prev) => prev + 1);
        return;
      }

      let nextLineIndex = currentLineIndex + 1;
      while (
        nextLineIndex < TYPED_LINES.length &&
        TYPED_LINES[nextLineIndex].length === 0
      ) {
        nextLineIndex += 1;
      }

      setCurrentLineIndex(nextLineIndex);
      setCurrentCharIndex(0);
    }, TYPED_CHAR_DELAY);

    return () => window.clearTimeout(handle);
  }, [
    hasStarted,
    currentCharIndex,
    currentLineIndex,
    typingComplete,
    sceneStarted,
  ]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL);
    return () => window.clearInterval(handle);
  }, []);

  const allCandlesBlown = candlesLit.every(lit => !lit);
  
  // Track which candle to blow next
  const nextCandleIndex = useMemo(() => {
    return candlesLit.findIndex(lit => lit);
  }, [candlesLit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (!hasStarted) {
        playBackgroundMusic();
        setHasStarted(true);
        return;
      }
      if (hasAnimationCompleted && !allCandlesBlown) {
        // Blow out one candle at a time
        const candleIndex = nextCandleIndex;
        if (candleIndex !== -1) {
          setCandlesLit(prev => {
            const newState = [...prev];
            newState[candleIndex] = false;
            
            // Show the reason for this candle
            setHoveredCandleIndex(candleIndex);
            setTimeout(() => {
              setHoveredCandleIndex(null);
            }, 3000); // Show reason for 3 seconds
            
            // Check if all candles are blown
            const allBlown = newState.every(lit => !lit);
            if (allBlown) {
              setFireworksActive(true);
              // Show video after 3 seconds
              setTimeout(() => {
                setShowVideo(true);
              }, 3000);
            }
            
            return newState;
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStarted, hasAnimationCompleted, allCandlesBlown, nextCandleIndex, playBackgroundMusic]);

  const handleCardToggle = useCallback((id: string) => {
    setActiveCardId((current) => (current === id ? null : id));
  }, []);

  const handleCandleClick = useCallback((index: number) => {
    if (hasAnimationCompleted) {
      setCandlesLit(prev => {
        const newState = [...prev];
        newState[index] = false;
        
        // Check if all candles are blown
        const allBlown = newState.every(lit => !lit);
        if (allBlown) {
          setFireworksActive(true);
          // Show video after 3 seconds
          setTimeout(() => {
            setShowVideo(true);
          }, 3000);
        }
        
        return newState;
      });
    }
  }, [hasAnimationCompleted]);

  const isScenePlaying = hasStarted && sceneStarted;

  return (
    <div className="App">
      <div
        className="background-overlay"
        style={{ opacity: backgroundOpacity }}
      >
        <div className="typed-text">
          {typedLines.map((line, index) => {
            const showCursor =
              cursorVisible &&
              index === cursorTargetIndex &&
              (!typingComplete || !sceneStarted);
            return (
              <span className="typed-line" key={`typed-line-${index}`}>
                {line || "\u00a0"}
                {showCursor && (
                  <span aria-hidden="true" className="typed-cursor">
                    _
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Time Zone Display */}
      {sceneStarted && (
        <div style={{
          position: 'absolute',
          top: '2rem',
          right: '2rem',
          zIndex: 3,
          color: 'white',
          fontFamily: '"Courier New", monospace',
          fontSize: '0.9rem',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '1rem',
          borderRadius: '8px',
          textAlign: 'right',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Your time</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{yourTime}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Her time (India)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ff69b4' }}>{herTime}</div>
          </div>
        </div>
      )}

      {/* Love Reason Tooltip */}
      {hoveredCandleIndex !== null && hasAnimationCompleted && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          background: 'rgba(255, 105, 180, 0.95)',
          color: 'white',
          padding: '1.5rem 2rem',
          borderRadius: '12px',
          fontFamily: '"Courier New", monospace',
          fontSize: '1.2rem',
          maxWidth: '400px',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(255, 105, 180, 0.5)',
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.9, marginBottom: '0.5rem' }}>
            Reason #{hoveredCandleIndex + 1}
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '1.3rem' }}>
            {LOVE_REASONS[hoveredCandleIndex]}
          </div>
        </div>
      )}

      {hasAnimationCompleted && !allCandlesBlown && (
        <div className="hint-overlay">
          Press SPACE to blow out candles one by one 🕯️<br/>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Each candle reveals a reason why I love you ✨</span>
        </div>
      )}

      {/* Video Message Overlay */}
      {showVideo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0, 0, 0, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          padding: '2rem'
        }}>
          <video
            controls
            autoPlay
            style={{
              maxWidth: '90%',
              maxHeight: '80vh',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}
          >
            <source src="/birthday-message.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <button
            onClick={() => setShowVideo(false)}
            style={{
              marginTop: '2rem',
              padding: '1rem 2rem',
              background: '#ff69b4',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.2rem',
              cursor: 'pointer',
              fontFamily: '"Courier New", monospace',
              letterSpacing: '0.2em',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#ff1493')}
            onMouseOut={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = '#ff69b4')}
          >
            CLOSE
          </button>
        </div>
      )}

      <Canvas
        gl={{ alpha: true }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
        }}
      >
        <Suspense fallback={null}>
          <AnimatedScene
            isPlaying={isScenePlaying}
            candlesLit={candlesLit}
            onBackgroundFadeChange={setBackgroundOpacity}
            onEnvironmentProgressChange={setEnvironmentProgress}
            onAnimationComplete={() => setHasAnimationCompleted(true)}
            cards={BIRTHDAY_CARDS}
            activeCardId={activeCardId}
            onToggleCard={handleCardToggle}
            hoveredCandleIndex={hoveredCandleIndex}
            onCandleHover={setHoveredCandleIndex}
            onCandleClick={handleCandleClick}
          />
          <ambientLight intensity={(1 - environmentProgress) * 0.8} />
          <directionalLight intensity={0.5} position={[2, 10, 0]} color={[1, 0.9, 0.95]}/>
          <Environment
            files={["/shanghai_bund_4k.hdr"]}
            backgroundRotation={[0, 3.3, 0]}
            environmentRotation={[0, 3.3, 0]}
            background
            environmentIntensity={0.1 * environmentProgress}
            backgroundIntensity={0.05 * environmentProgress}
          />
          <EnvironmentBackgroundController intensity={0.05 * environmentProgress} />
          <Fireworks isActive={fireworksActive} origin={[0, 10, 0]} />
          <ConfiguredOrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}
