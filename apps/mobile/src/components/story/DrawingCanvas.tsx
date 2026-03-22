import { useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawTool = 'pen' | 'marker' | 'highlighter' | 'neon';

export interface DrawPath {
  d: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  tool: DrawTool;
}

interface DrawingCanvasProps {
  visible: boolean;
  onClose: () => void;
  onSave: (paths: DrawPath[]) => void;
  canvasWidth: number;
  canvasHeight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAW_COLORS: readonly string[] = [
  '#FFFFFF', '#000000', '#0A7B4F', '#C8963E',
  '#F85149', '#58A6FF', '#D2A8FF', '#FFA657',
  '#3FB950', '#F0883E', '#FF7B72', '#79C0FF',
];

interface ToolConfig {
  label: string;
  icon: 'pencil' | 'edit' | 'type' | 'sun';
  defaultWidth: number;
  opacity: number;
}

const TOOL_CONFIGS: Record<DrawTool, ToolConfig> = {
  pen:         { label: 'Pen',         icon: 'pencil', defaultWidth: 3,  opacity: 1.0 },
  marker:      { label: 'Marker',      icon: 'edit',   defaultWidth: 12, opacity: 0.6 },
  highlighter: { label: 'Highlighter', icon: 'type',   defaultWidth: 20, opacity: 0.3 },
  neon:        { label: 'Neon',        icon: 'sun',    defaultWidth: 4,  opacity: 1.0 },
};

const TOOLS: readonly DrawTool[] = ['pen', 'marker', 'highlighter', 'neon'];

interface SizeStep {
  label: string;
  multiplier: number;
}

const SIZE_STEPS: readonly SizeStep[] = [
  { label: 'S',  multiplier: 0.5 },
  { label: 'M',  multiplier: 1.0 },
  { label: 'L',  multiplier: 2.0 },
  { label: 'XL', multiplier: 3.0 },
];

const MIN_MOVE_DISTANCE = 1.5; // minimum px to register a new point

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DrawingCanvas({
  visible,
  onClose,
  onSave,
  canvasWidth,
  canvasHeight,
}: DrawingCanvasProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();

  // Drawing state
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [activeTool, setActiveTool] = useState<DrawTool>('pen');
  const [activeColor, setActiveColor] = useState('#FFFFFF');
  const [sizeIndex, setSizeIndex] = useState(1); // M by default

  // Current in-progress path (ref for perf — avoids re-renders during drawing)
  const currentPathRef = useRef<string>('');
  const [currentPathD, setCurrentPathD] = useState<string>('');
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointCountRef = useRef(0);

  // Computed stroke width
  const strokeWidth = useMemo(() => {
    const base = TOOL_CONFIGS[activeTool].defaultWidth;
    return base * SIZE_STEPS[sizeIndex].multiplier;
  }, [activeTool, sizeIndex]);

  const currentOpacity = TOOL_CONFIGS[activeTool].opacity;

  // -------------------------------------------------------------------------
  // Gesture handlers
  // -------------------------------------------------------------------------

  const onGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!isDrawingRef.current) return;

      const { x, y } = event.nativeEvent;
      const last = lastPointRef.current;

      // Skip if movement is too small (reduces jitter)
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_MOVE_DISTANCE) return;
      }

      lastPointRef.current = { x, y };
      pointCountRef.current += 1;

      // Use quadratic bezier for smoother curves after first few points
      if (pointCountRef.current <= 2) {
        currentPathRef.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        // Smooth with quadratic bezier — use last point as control
        const cx = last ? last.x : x;
        const cy = last ? last.y : y;
        const mx = (cx + x) / 2;
        const my = (cy + y) / 2;
        currentPathRef.current += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }

      setCurrentPathD(currentPathRef.current);
    },
    [],
  );

  const onHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, x, y } = event.nativeEvent;

      if (state === State.BEGAN || state === State.ACTIVE) {
        if (!isDrawingRef.current) {
          // Start a new path
          isDrawingRef.current = true;
          lastPointRef.current = { x, y };
          pointCountRef.current = 1;
          currentPathRef.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          setCurrentPathD(currentPathRef.current);
        }
      }

      if (state === State.END || state === State.CANCELLED) {
        if (isDrawingRef.current) {
          isDrawingRef.current = false;

          const d = currentPathRef.current;

          // Only save if we have actual path data (not just a move command)
          if (d && d.length > 0) {
            // If it's just a dot (single point, no lines), make it a small circle
            const finalD = pointCountRef.current <= 1
              ? `${d} L ${x.toFixed(1)} ${(y + 0.5).toFixed(1)}`
              : d;

            const newPath: DrawPath = {
              d: finalD,
              stroke: activeColor,
              strokeWidth,
              opacity: currentOpacity,
              tool: activeTool,
            };

            setPaths((prev) => [...prev, newPath]);
          }

          currentPathRef.current = '';
          setCurrentPathD('');
          lastPointRef.current = null;
          pointCountRef.current = 0;
        }
      }
    },
    [activeColor, strokeWidth, currentOpacity, activeTool],
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    setPaths((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setPaths([]);
  }, []);

  const handleDone = useCallback(() => {
    onSave(paths);
  }, [onSave, paths]);

  const handleClose = useCallback(() => {
    // Reset state
    setPaths([]);
    currentPathRef.current = '';
    setCurrentPathD('');
    isDrawingRef.current = false;
    lastPointRef.current = null;
    pointCountRef.current = 0;
    onClose();
  }, [onClose]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderPath = useCallback((path: DrawPath, index: number) => {
    if (path.tool === 'neon') {
      // Neon: two passes — glow (wider, transparent) + sharp center
      return (
        <G key={index}>
          <Path
            d={path.d}
            stroke={path.stroke}
            strokeWidth={path.strokeWidth * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.3}
          />
          <Path
            d={path.d}
            stroke={path.stroke}
            strokeWidth={path.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={path.opacity}
          />
        </G>
      );
    }

    return (
      <Path
        key={index}
        d={path.d}
        stroke={path.stroke}
        strokeWidth={path.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={path.opacity}
      />
    );
  }, []);

  const renderCurrentPath = useCallback(() => {
    if (!currentPathD) return null;

    if (activeTool === 'neon') {
      return (
        <G>
          <Path
            d={currentPathD}
            stroke={activeColor}
            strokeWidth={strokeWidth * 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.3}
          />
          <Path
            d={currentPathD}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={currentOpacity}
          />
        </G>
      );
    }

    return (
      <Path
        d={currentPathD}
        stroke={activeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={currentOpacity}
      />
    );
  }, [currentPathD, activeColor, strokeWidth, currentOpacity, activeTool]);

  // -------------------------------------------------------------------------
  // Don't render anything if not visible
  // -------------------------------------------------------------------------

  if (!visible) return null;

  const hasContent = paths.length > 0;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.overlay, { width: canvasWidth, height: canvasHeight }]}
    >
      {/* Top toolbar */}
      <View style={[styles.topToolbar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topLeft}>
          <Pressable
            accessibilityRole="button"
            onPress={handleUndo}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
              !hasContent && styles.toolbarButtonDisabled,
            ]}
            disabled={!hasContent}
            hitSlop={8}
          >
            <Icon name="arrow-left" size="sm" color={hasContent ? colors.text.primary : colors.text.tertiary} />
            <Text style={[styles.toolbarButtonText, !hasContent && styles.toolbarButtonTextDisabled]}>
              {t('story.drawing.undo', { defaultValue: 'Undo' })}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleClear}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && styles.toolbarButtonPressed,
              !hasContent && styles.toolbarButtonDisabled,
            ]}
            disabled={!hasContent}
            hitSlop={8}
          >
            <Icon name="trash" size="sm" color={hasContent ? colors.text.primary : colors.text.tertiary} />
            <Text style={[styles.toolbarButtonText, !hasContent && styles.toolbarButtonTextDisabled]}>
              {t('story.drawing.clear', { defaultValue: 'Clear' })}
            </Text>
          </Pressable>
        </View>

        <View style={styles.topRight}>
          <Pressable
            accessibilityRole="button"
            onPress={handleClose}
            style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
            hitSlop={8}
          >
            <Icon name="x" size="sm" color={colors.text.primary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleDone}
            style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
            hitSlop={8}
          >
            <Icon name="check" size="sm" color={colors.text.onColor} />
            <Text style={styles.doneButtonText}>
              {t('story.drawing.done', { defaultValue: 'Done' })}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* SVG Canvas with gesture handler */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        minDist={0}
        avgTouches={false}
      >
        <Animated.View style={styles.canvasContainer}>
          <Svg
            width={canvasWidth}
            height={canvasHeight}
            style={styles.svg}
          >
            {/* Completed paths */}
            {paths.map(renderPath)}

            {/* Active / in-progress path */}
            {renderCurrentPath()}
          </Svg>
        </Animated.View>
      </PanGestureHandler>

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + spacing.sm }]}>
        {/* Color palette */}
        <View style={styles.colorRow}>
          {DRAW_COLORS.map((color) => {
            const isActive = activeColor === color;
            return (
              <Pressable
                accessibilityRole="button"
                key={color}
                onPress={() => setActiveColor(color)}
                hitSlop={4}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  isActive && styles.colorSwatchActive,
                  color === '#000000' && [styles.colorSwatchBlack, { borderColor: tc.border }],
                ]}
              />
            );
          })}
        </View>

        {/* Stroke size selector (discrete S/M/L/XL) */}
        <View style={styles.sizeRow}>
          <Text style={styles.sizeLabel}>
            {t('story.drawing.size', { defaultValue: 'Size' })}
          </Text>
          {SIZE_STEPS.map((step, index) => {
            const isActive = sizeIndex === index;
            return (
              <Pressable
                accessibilityRole="button"
                key={step.label}
                onPress={() => setSizeIndex(index)}
                style={[
                  styles.sizeButton,
                  isActive && styles.sizeButtonActive,
                ]}
                hitSlop={4}
              >
                <View
                  style={[
                    styles.sizeDot,
                    {
                      width: 6 + index * 4,
                      height: 6 + index * 4,
                      borderRadius: radius.full,
                      backgroundColor: isActive ? colors.emerald : colors.text.secondary,
                    },
                  ]}
                />
                <Text style={[styles.sizeStepText, isActive && styles.sizeStepTextActive]}>
                  {step.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tool selector */}
        <View style={styles.toolRow}>
          {TOOLS.map((tool) => {
            const config = TOOL_CONFIGS[tool];
            const isActive = activeTool === tool;
            return (
              <Pressable
                accessibilityRole="button"
                key={tool}
                onPress={() => setActiveTool(tool)}
                style={[
                  styles.toolButton,
                  isActive && styles.toolButtonActive,
                ]}
                hitSlop={4}
              >
                <Icon
                  name={config.icon}
                  size="sm"
                  color={isActive ? colors.emerald : colors.text.secondary}
                />
                <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>
                  {t(`story.drawing.tool.${tool}`, { defaultValue: config.label })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 100,
  },
  canvasContainer: {
    flex: 1,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },

  // Top toolbar
  topToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    zIndex: 110,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  toolbarButtonPressed: {
    opacity: 0.7,
  },
  toolbarButtonDisabled: {
    opacity: 0.4,
  },
  toolbarButtonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  toolbarButtonTextDisabled: {
    color: colors.text.tertiary,
  },

  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  doneButtonPressed: {
    opacity: 0.8,
  },
  doneButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.onColor,
  },

  // Bottom controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 110,
  },

  // Color palette
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: colors.text.primary,
    transform: [{ scale: 1.15 }],
  },
  colorSwatchBlack: {
    borderColor: colors.dark.border,
    borderWidth: 1,
  },

  // Size selector
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sizeLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  sizeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 40,
  },
  sizeButtonActive: {
    backgroundColor: colors.active.emerald10,
  },
  sizeDot: {
    marginBottom: spacing.xs,
  },
  sizeStepText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  sizeStepTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },

  // Tool selector
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toolButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minWidth: 64,
  },
  toolButtonActive: {
    backgroundColor: colors.active.emerald10,
  },
  toolLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  toolLabelActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.emerald,
  },
});

export default DrawingCanvas;
