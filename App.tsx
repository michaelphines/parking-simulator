import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  PanResponder,
  GestureResponderEvent,
} from "react-native";
import { CAR_DATABASE, CarSpec } from "./src/carData";

const SCREEN = Dimensions.get("window");

// Scale: 1 foot = N pixels on screen. Adjustable via zoom.
const BASE_SCALE = 3.5; // px per foot at default zoom

type SteerDir = "left" | "straight" | "right";

interface PlacedCar {
  id: string;
  spec: CarSpec;
  x: number; // center x in feet
  y: number; // center y in feet
  angle: number; // radians, 0 = pointing right
}

interface WheelTrack {
  x: number;
  y: number;
}

type AppMode = "menu" | "setup" | "drive";

export default function App() {
  const [mode, setMode] = useState<AppMode>("menu");
  const [playerSpec, setPlayerSpec] = useState<CarSpec>(CAR_DATABASE[0]);
  const [obstacles, setObstacles] = useState<PlacedCar[]>([]);
  const [playerCar, setPlayerCar] = useState<PlacedCar | null>(null);
  const [steer, setSteer] = useState<SteerDir>("straight");
  const [gear, setGear] = useState<"forward" | "reverse">("forward");
  const [moving, setMoving] = useState(false);
  const [wheelTracks, setWheelTracks] = useState<WheelTrack[][]>([[], [], [], []]);
  const [setupPhase, setSetupPhase] = useState<"obstacles" | "player">("obstacles");
  const [obstacleSpec, setObstacleSpec] = useState<CarSpec>(CAR_DATABASE[3]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [showCarPicker, setShowCarPicker] = useState<"player" | "obstacle" | null>(null);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playerRef = useRef(playerCar);
  const steerRef = useRef(steer);
  const gearRef = useRef(gear);
  const movingRef = useRef(moving);
  const tracksRef = useRef(wheelTracks);
  const trackCounterRef = useRef(0);

  useEffect(() => { playerRef.current = playerCar; }, [playerCar]);
  useEffect(() => { steerRef.current = steer; }, [steer]);
  useEffect(() => { gearRef.current = gear; }, [gear]);
  useEffect(() => { movingRef.current = moving; }, [moving]);
  useEffect(() => { tracksRef.current = wheelTracks; }, [wheelTracks]);

  const scale = BASE_SCALE * zoom;

  // Convert feet to screen pixels
  const ftToPx = (ft: number) => ft * scale;
  const inToPx = (inches: number) => (inches / 12) * scale;

  // World to screen coords
  const worldToScreen = (wx: number, wy: number) => ({
    sx: wx * scale + pan.x + SCREEN.width / 2,
    sy: wy * scale + pan.y + SCREEN.height / 2,
  });

  const screenToWorld = (sx: number, sy: number) => ({
    wx: (sx - pan.x - SCREEN.width / 2) / scale,
    wy: (sy - pan.y - SCREEN.height / 2) / scale,
  });

  // Ackermann steering: compute turning radius from full lock
  const getTurningRadius = (spec: CarSpec): number => {
    return spec.turningCircleFeet / 2; // turning circle = diameter
  };

  // Physics tick
  const tick = useCallback((dt: number) => {
    const car = playerRef.current;
    if (!car || !movingRef.current) return;

    const speed = 4; // feet per second
    const direction = gearRef.current === "forward" ? 1 : -1;
    const ds = speed * dt * direction;
    const wb = car.spec.wheelbaseInches / 12; // wheelbase in feet

    let newAngle = car.angle;
    let newX = car.x;
    let newY = car.y;

    if (steerRef.current === "straight") {
      newX += Math.cos(car.angle) * ds;
      newY += Math.sin(car.angle) * ds;
    } else {
      const R = getTurningRadius(car.spec);
      const turnSign = steerRef.current === "left" ? -1 : 1;
      const dTheta = ds / R;
      const actualDTheta = dTheta * turnSign;

      // Center of turning circle
      const cx = car.x - R * turnSign * Math.sin(car.angle);
      const cy = car.y + R * turnSign * Math.cos(car.angle);

      newAngle = car.angle + actualDTheta;
      newX = cx + R * turnSign * Math.sin(newAngle);
      newY = cy - R * turnSign * Math.cos(newAngle);
    }

    // Compute wheel positions for tracks
    const halfWb = wb / 2;
    const halfWidth = (car.spec.widthInches / 12) / 2;
    const cosA = Math.cos(newAngle);
    const sinA = Math.sin(newAngle);

    const wheels = [
      { x: newX + halfWb * cosA - halfWidth * sinA, y: newY + halfWb * sinA + halfWidth * cosA }, // front left
      { x: newX + halfWb * cosA + halfWidth * sinA, y: newY + halfWb * sinA - halfWidth * cosA }, // front right
      { x: newX - halfWb * cosA - halfWidth * sinA, y: newY - halfWb * sinA + halfWidth * cosA }, // rear left
      { x: newX - halfWb * cosA + halfWidth * sinA, y: newY - halfWb * sinA - halfWidth * cosA }, // rear right
    ];

    // Record tracks every few frames
    trackCounterRef.current++;
    if (trackCounterRef.current % 2 === 0) {
      const newTracks = tracksRef.current.map((track, i) => [
        ...track,
        { x: wheels[i].x, y: wheels[i].y },
      ]);
      setWheelTracks(newTracks);
    }

    const updated = { ...car, x: newX, y: newY, angle: newAngle };
    setPlayerCar(updated);
  }, []);

  // Animation loop
  useEffect(() => {
    if (mode !== "drive") return;

    const loop = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      tick(dt);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      lastTimeRef.current = 0;
    };
  }, [mode, tick]);

  // Place obstacle on tap
  const handleCanvasTap = (e: GestureResponderEvent) => {
    if (mode !== "setup") return;
    const { locationX, locationY } = e.nativeEvent;
    const { wx, wy } = screenToWorld(locationX, locationY);

    if (setupPhase === "obstacles") {
      const newObs: PlacedCar = {
        id: `obs-${Date.now()}`,
        spec: obstacleSpec,
        x: wx,
        y: wy,
        angle: 0,
      };
      setObstacles((prev) => [...prev, newObs]);
    } else {
      setPlayerCar({
        id: "player",
        spec: playerSpec,
        x: wx,
        y: wy,
        angle: 0,
      });
    }
  };

  const rotateCar = (id: string, direction: number) => {
    const rotAmount = Math.PI / 12; // 15 degrees
    if (id === "player" && playerCar) {
      setPlayerCar({ ...playerCar, angle: playerCar.angle + rotAmount * direction });
    } else {
      setObstacles((prev) =>
        prev.map((o) => (o.id === id ? { ...o, angle: o.angle + rotAmount * direction } : o))
      );
    }
  };

  const removeObstacle = (id: string) => {
    setObstacles((prev) => prev.filter((o) => o.id !== id));
  };

  // Render a car shape as absolute-positioned view
  const renderCar = (car: PlacedCar, isPlayer: boolean = false) => {
    const { sx, sy } = worldToScreen(car.x, car.y);
    const w = inToPx(car.spec.widthInches);
    const h = inToPx(car.spec.lengthInches);
    const wb = inToPx(car.spec.wheelbaseInches);
    const angleDeg = (car.angle * 180) / Math.PI;

    return (
      <View key={car.id}>
        {/* Car body */}
        <View
          style={{
            position: "absolute",
            left: sx - w / 2,
            top: sy - h / 2,
            width: w,
            height: h,
            backgroundColor: isPlayer ? car.spec.color : "#666",
            borderWidth: isPlayer ? 2 : 1,
            borderColor: isPlayer ? "#fff" : "#444",
            borderRadius: 3,
            transform: [{ rotate: `${angleDeg + 90}deg` }],
            opacity: 0.85,
            justifyContent: "flex-start",
            alignItems: "center",
            paddingTop: 2,
          }}
        >
          {/* Front indicator */}
          <View
            style={{
              width: w * 0.6,
              height: 3,
              backgroundColor: isPlayer ? "#fff" : "#aaa",
              borderRadius: 1,
            }}
          />
          {/* Wheels */}
          {renderWheels(w, h, wb)}
        </View>

        {/* Label + controls in setup mode */}
        {mode === "setup" && (
          <View
            style={{
              position: "absolute",
              left: sx - 50,
              top: sy + h / 2 + 5,
              width: 100,
              alignItems: "center",
            }}
          >
            <Text style={styles.carLabel} numberOfLines={1}>
              {car.spec.name}
            </Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => rotateCar(car.id, -1)}
              >
                <Text style={styles.smallBtnText}>↺</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => rotateCar(car.id, 1)}
              >
                <Text style={styles.smallBtnText}>↻</Text>
              </TouchableOpacity>
              {!isPlayer && (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#c0392b" }]}
                  onPress={() => removeObstacle(car.id)}
                >
                  <Text style={styles.smallBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderWheels = (carW: number, carH: number, wb: number) => {
    const wheelW = Math.max(carW * 0.12, 3);
    const wheelH = Math.max(carH * 0.08, 6);
    const frontY = (carH - wb) / 2;
    const rearY = carH - (carH - wb) / 2;

    return (
      <>
        {/* Front left */}
        <View style={{ position: "absolute", left: 1, top: frontY - wheelH / 2, width: wheelW, height: wheelH, backgroundColor: "#222", borderRadius: 1 }} />
        {/* Front right */}
        <View style={{ position: "absolute", right: 1, top: frontY - wheelH / 2, width: wheelW, height: wheelH, backgroundColor: "#222", borderRadius: 1 }} />
        {/* Rear left */}
        <View style={{ position: "absolute", left: 1, top: rearY - wheelH / 2, width: wheelW, height: wheelH, backgroundColor: "#222", borderRadius: 1 }} />
        {/* Rear right */}
        <View style={{ position: "absolute", right: 1, top: rearY - wheelH / 2, width: wheelW, height: wheelH, backgroundColor: "#222", borderRadius: 1 }} />
      </>
    );
  };

  const renderWheelTracks = () => {
    const colors = ["rgba(255,255,0,0.3)", "rgba(255,255,0,0.3)", "rgba(255,100,0,0.3)", "rgba(255,100,0,0.3)"];
    return wheelTracks.map((track, i) =>
      track.map((pt, j) => {
        const { sx, sy } = worldToScreen(pt.x, pt.y);
        return (
          <View
            key={`track-${i}-${j}`}
            style={{
              position: "absolute",
              left: sx - 1.5,
              top: sy - 1.5,
              width: 3,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: colors[i],
            }}
          />
        );
      })
    );
  };

  // Draw parking space lines (curb)
  const renderCurb = () => {
    const { sx: sx1, sy: sy1 } = worldToScreen(-50, 8);
    const { sx: sx2, sy: sy2 } = worldToScreen(50, 8);
    const width = sx2 - sx1;

    return (
      <View
        style={{
          position: "absolute",
          left: sx1,
          top: sy1,
          width: width,
          height: 3,
          backgroundColor: "#555",
        }}
      />
    );
  };

  // Grid lines for reference
  const renderGrid = () => {
    const lines: React.ReactNode[] = [];
    const spacing = 5; // 5 feet
    for (let i = -50; i <= 50; i += spacing) {
      const { sx: hx1, sy: hy } = worldToScreen(-50, i);
      const { sx: hx2 } = worldToScreen(50, i);
      lines.push(
        <View
          key={`hg-${i}`}
          style={{
            position: "absolute",
            left: hx1,
            top: hy,
            width: hx2 - hx1,
            height: 1,
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        />
      );
      const { sx: vx, sy: vy1 } = worldToScreen(i, -50);
      const { sy: vy2 } = worldToScreen(i, 50);
      lines.push(
        <View
          key={`vg-${i}`}
          style={{
            position: "absolute",
            left: vx,
            top: vy1,
            width: 1,
            height: vy2 - vy1,
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        />
      );
    }
    return lines;
  };

  // Pan gesture
  const panRef = useRef(pan);
  useEffect(() => { panRef.current = pan; }, [pan]);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: (e) => {
        lastTouchRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      },
      onPanResponderMove: (e) => {
        if (!lastTouchRef.current) return;
        const dx = e.nativeEvent.pageX - lastTouchRef.current.x;
        const dy = e.nativeEvent.pageY - lastTouchRef.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
          lastTouchRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }
      },
      onPanResponderRelease: (e, gs) => {
        lastTouchRef.current = null;
        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          handleCanvasTap(e);
        }
      },
    })
  ).current;

  // ---- SCREENS ----

  if (showCarPicker) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Select Car</Text>
        <ScrollView style={{ flex: 1, width: "100%" }}>
          {CAR_DATABASE.map((spec) => (
            <TouchableOpacity
              key={spec.name}
              style={[
                styles.carPickerItem,
                (showCarPicker === "player" ? playerSpec : obstacleSpec).name === spec.name && styles.carPickerItemSelected,
              ]}
              onPress={() => {
                if (showCarPicker === "player") setPlayerSpec(spec);
                else setObstacleSpec(spec);
                setShowCarPicker(null);
              }}
            >
              <View style={[styles.colorDot, { backgroundColor: spec.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.carPickerName}>{spec.name}</Text>
                <Text style={styles.carPickerStats}>
                  {spec.lengthInches.toFixed(0)}″ long · {spec.widthInches.toFixed(0)}″ wide · {spec.turningCircleFeet.toFixed(1)}ft turn circle
                </Text>
                <Text style={styles.carPickerStats}>
                  Wheelbase: {spec.wheelbaseInches.toFixed(1)}″ · Turn radius: {(spec.turningCircleFeet / 2).toFixed(1)}ft
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.backBtn} onPress={() => setShowCarPicker(null)}>
          <Text style={styles.backBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === "menu") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Parallel Parking{"\n"}Simulator</Text>
        <Text style={styles.subtitle}>Practice with real car dimensions</Text>

        <View style={styles.menuSection}>
          <Text style={styles.menuLabel}>Your Car:</Text>
          <TouchableOpacity
            style={styles.carSelectBtn}
            onPress={() => setShowCarPicker("player")}
          >
            <View style={[styles.colorDot, { backgroundColor: playerSpec.color }]} />
            <Text style={styles.carSelectText}>{playerSpec.name}</Text>
            <Text style={styles.carSelectArrow}>▸</Text>
          </TouchableOpacity>
          <Text style={styles.specText}>
            Length: {playerSpec.lengthInches.toFixed(0)}″ ({(playerSpec.lengthInches / 12).toFixed(1)}ft) · Width: {playerSpec.widthInches.toFixed(0)}″
          </Text>
          <Text style={styles.specText}>
            Turning circle: {playerSpec.turningCircleFeet.toFixed(1)}ft · Wheelbase: {playerSpec.wheelbaseInches.toFixed(1)}″
          </Text>
        </View>

        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => {
            setMode("setup");
            setSetupPhase("obstacles");
            setObstacles([]);
            setPlayerCar(null);
            setWheelTracks([[], [], [], []]);
            setPan({ x: 0, y: 0 });
            setZoom(1);
          }}
        >
          <Text style={styles.startBtnText}>Start Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === "setup" || mode === "drive") {
    return (
      <View style={styles.container}>
        {/* Canvas area */}
        <View style={styles.canvas} {...panResponder.panHandlers}>
          {/* Road surface */}
          <View style={StyleSheet.absoluteFill}>
            {renderGrid()}
            {renderCurb()}
            {renderWheelTracks()}
            {obstacles.map((obs) => renderCar(obs, false))}
            {playerCar && renderCar(playerCar, true)}
          </View>
        </View>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => {
              setMode("menu");
              setMoving(false);
            }}
          >
            <Text style={styles.topBtnText}>← Menu</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.topBtn}
              onPress={() => setZoom((z) => Math.min(z * 1.3, 5))}
            >
              <Text style={styles.topBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topBtn}
              onPress={() => setZoom((z) => Math.max(z / 1.3, 0.3))}
            >
              <Text style={styles.topBtnText}>−</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Setup controls */}
        {mode === "setup" && (
          <View style={styles.setupBar}>
            {setupPhase === "obstacles" ? (
              <>
                <Text style={styles.setupTitle}>Tap to place obstacle cars</Text>
                <TouchableOpacity
                  style={styles.obstaclePickBtn}
                  onPress={() => setShowCarPicker("obstacle")}
                >
                  <Text style={styles.obstaclePickText}>Type: {obstacleSpec.name} ▸</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={() => setSetupPhase("player")}
                >
                  <Text style={styles.nextBtnText}>
                    {obstacles.length === 0 ? "Skip → Place Your Car" : `Done (${obstacles.length}) → Place Your Car`}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.setupTitle}>Tap to place your {playerSpec.name}</Text>
                {playerCar && (
                  <TouchableOpacity
                    style={styles.startDriveBtn}
                    onPress={() => setMode("drive")}
                  >
                    <Text style={styles.startDriveBtnText}>Start Driving</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.nextBtn, { backgroundColor: "#555" }]}
                  onPress={() => setSetupPhase("obstacles")}
                >
                  <Text style={styles.nextBtnText}>← Back to Obstacles</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Drive controls */}
        {mode === "drive" && (
          <View style={styles.driveControls}>
            {/* Steering */}
            <View style={styles.steeringRow}>
              <TouchableOpacity
                style={[styles.steerBtn, steer === "left" && styles.steerBtnActive]}
                onPress={() => setSteer("left")}
              >
                <Text style={styles.steerBtnText}>◀ Left</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.steerBtn, steer === "straight" && styles.steerBtnActive]}
                onPress={() => setSteer("straight")}
              >
                <Text style={styles.steerBtnText}>Straight</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.steerBtn, steer === "right" && styles.steerBtnActive]}
                onPress={() => setSteer("right")}
              >
                <Text style={styles.steerBtnText}>Right ▶</Text>
              </TouchableOpacity>
            </View>

            {/* Gear + Go */}
            <View style={styles.gearRow}>
              <TouchableOpacity
                style={[styles.gearBtn, gear === "reverse" && styles.gearBtnActiveR]}
                onPress={() => setGear("reverse")}
              >
                <Text style={styles.gearBtnText}>R</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.goBtn,
                  moving && styles.goBtnActive,
                ]}
                onPressIn={() => setMoving(true)}
                onPressOut={() => setMoving(false)}
              >
                <Text style={styles.goBtnText}>{moving ? "MOVING" : "HOLD TO GO"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gearBtn, gear === "forward" && styles.gearBtnActiveF]}
                onPress={() => setGear("forward")}
              >
                <Text style={styles.gearBtnText}>D</Text>
              </TouchableOpacity>
            </View>

            {/* Utility */}
            <View style={styles.utilRow}>
              <TouchableOpacity
                style={styles.utilBtn}
                onPress={() => setWheelTracks([[], [], [], []])}
              >
                <Text style={styles.utilBtnText}>Clear Tracks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.utilBtn}
                onPress={() => {
                  setMode("setup");
                  setMoving(false);
                  setSetupPhase("player");
                }}
              >
                <Text style={styles.utilBtnText}>Edit Setup</Text>
              </TouchableOpacity>
            </View>

            {/* Current car info */}
            {playerCar && (
              <Text style={styles.infoText}>
                {playerCar.spec.name} · {playerCar.spec.lengthInches.toFixed(0)}″ long · Turn ⌀ {playerCar.spec.turningCircleFeet.toFixed(1)}ft
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginBottom: 30,
  },
  menuSection: {
    width: "85%",
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  menuLabel: {
    color: "#888",
    fontSize: 13,
    marginBottom: 8,
  },
  carSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f3460",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  carSelectText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  carSelectArrow: {
    color: "#888",
    fontSize: 18,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  specText: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 2,
  },
  startBtn: {
    backgroundColor: "#e94560",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  // Car picker
  carPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: "#16213e",
    borderRadius: 10,
  },
  carPickerItemSelected: {
    backgroundColor: "#0f3460",
    borderWidth: 1,
    borderColor: "#e94560",
  },
  carPickerName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  carPickerStats: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 2,
  },
  backBtn: {
    padding: 16,
    marginBottom: 40,
  },
  backBtnText: {
    color: "#e94560",
    fontSize: 17,
  },

  // Canvas
  canvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#2d2d44",
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  topBtn: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Setup
  setupBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    padding: 16,
    paddingBottom: 40,
    alignItems: "center",
  },
  setupTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  obstaclePickBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  obstaclePickText: {
    color: "#ccc",
    fontSize: 14,
  },
  nextBtn: {
    backgroundColor: "#0f3460",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  startDriveBtn: {
    backgroundColor: "#e94560",
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  startDriveBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  // Car labels in setup
  carLabel: {
    color: "#fff",
    fontSize: 10,
    textAlign: "center",
  },
  smallBtn: {
    backgroundColor: "#444",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: {
    color: "#fff",
    fontSize: 14,
  },

  // Drive controls
  driveControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 12,
    paddingBottom: 36,
  },
  steeringRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  steerBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  steerBtnActive: {
    backgroundColor: "#0f3460",
    borderWidth: 2,
    borderColor: "#3498db",
  },
  steerBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  gearRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  gearBtn: {
    backgroundColor: "#333",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  gearBtnActiveR: {
    backgroundColor: "#c0392b",
    borderWidth: 2,
    borderColor: "#e74c3c",
  },
  gearBtnActiveF: {
    backgroundColor: "#27ae60",
    borderWidth: 2,
    borderColor: "#2ecc71",
  },
  gearBtnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  goBtn: {
    backgroundColor: "#2c3e50",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 12,
  },
  goBtnActive: {
    backgroundColor: "#e94560",
  },
  goBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  utilRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 6,
  },
  utilBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  utilBtnText: {
    color: "#aaa",
    fontSize: 13,
  },
  infoText: {
    color: "#666",
    fontSize: 11,
    textAlign: "center",
  },
});
