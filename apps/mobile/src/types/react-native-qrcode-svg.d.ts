declare module 'react-native-qrcode-svg' {
  interface QRCodeProps {
    value?: string;
    size?: number;
    color?: string;
    backgroundColor?: string;
    logo?: { uri: string } | number;
    logoSize?: number;
    logoBackgroundColor?: string;
    logoMargin?: number;
    logoBorderRadius?: number;
    quietZone?: number;
    enableLinearGradient?: boolean;
    linearGradient?: string[];
    gradientDirection?: string[];
    ecl?: 'L' | 'M' | 'Q' | 'H';
    getRef?: (ref: unknown) => void;
    onError?: (error: Error) => void;
  }

  const QRCode: React.FC<QRCodeProps>;
  export default QRCode;
}
