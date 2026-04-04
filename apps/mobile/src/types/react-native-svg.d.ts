declare module 'react-native-svg' {
  import type { ViewProps } from 'react-native';

  interface SvgProps extends ViewProps {
    width?: number | string;
    height?: number | string;
    viewBox?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    opacity?: number;
    children?: React.ReactNode;
  }

  interface PathProps {
    d?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    strokeLinecap?: 'butt' | 'round' | 'square';
    strokeLinejoin?: 'miter' | 'round' | 'bevel';
    opacity?: number;
    fillRule?: 'nonzero' | 'evenodd';
    children?: React.ReactNode;
  }

  interface CircleProps {
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    opacity?: number;
    strokeDasharray?: string;
    strokeDashoffset?: number | string;
    strokeLinecap?: 'butt' | 'round' | 'square';
    rotation?: number;
    origin?: string;
    transform?: string;
    children?: React.ReactNode;
    animatedProps?: Record<string, unknown>;
  }

  interface GProps {
    opacity?: number;
    fill?: string;
    stroke?: string;
    transform?: string;
    children?: React.ReactNode;
  }

  interface RectProps {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    rx?: number | string;
    ry?: number | string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    opacity?: number;
    children?: React.ReactNode;
  }

  interface DefsProps {
    children?: React.ReactNode;
  }

  interface StopProps {
    offset?: number | string;
    stopColor?: string;
    stopOpacity?: number;
  }

  interface LinearGradientProps {
    id?: string;
    x1?: number | string;
    y1?: number | string;
    x2?: number | string;
    y2?: number | string;
    children?: React.ReactNode;
  }

  interface LineProps {
    x1?: number | string;
    y1?: number | string;
    x2?: number | string;
    y2?: number | string;
    stroke?: string;
    strokeWidth?: number | string;
    children?: React.ReactNode;
  }

  interface TextProps {
    x?: number | string;
    y?: number | string;
    fill?: string;
    fontSize?: number | string;
    fontWeight?: string;
    textAnchor?: 'start' | 'middle' | 'end';
    children?: React.ReactNode;
  }

  const Svg: React.FC<SvgProps>;
  const Path: React.FC<PathProps>;
  const Circle: React.FC<CircleProps>;
  const G: React.FC<GProps>;
  const Rect: React.FC<RectProps>;
  const Defs: React.FC<DefsProps>;
  const Stop: React.FC<StopProps>;
  const LinearGradient: React.FC<LinearGradientProps>;
  const Line: React.FC<LineProps>;
  const SvgText: React.FC<TextProps>;

  export { Svg, Path, Circle, G, Rect, Defs, Stop, LinearGradient, Line, SvgText as Text };
  export default Svg;
}
