import Svg, { Path } from 'react-native-svg';
import { theme } from '@/lib/theme';

const VIEWBOX = 459.56;
// Mesmo subpath do "G" isolado de `BrandLogotype` (o símbolo sozinho, sem o
// "rana." que vem depois no lockup completo) — o corte é exato: o próximo
// comando do path original começa em x=486, já fora deste quadrado.
const PATH_D =
  'M459.56,229.78c0,19.55-2.44,38.53-7.04,56.66-25.23,99.5-115.39,173.12-222.74,173.12-48.1,0-92.76-14.78-129.66-40.05C40.79,378.88,1.47,311.14.04,234.14-2.38,104.34,104.35-2.38,234.14.04c72.25,1.35,136.33,36.04,177.53,89.32,4.63,5.99,4.09,14.5-1.26,19.85l-41.41,41.41c-6.66,6.66-17.64,5.58-23.04-2.13-25.2-35.94-66.64-59.66-113.67-60.47-79.81-1.39-145.65,64.45-144.27,144.27.93,53.56,31.56,99.88,76.12,123.2,19.63,10.26,41.96,16.07,65.64,16.07,48.5,0,91.31-24.35,116.87-61.49,6.89-10-.22-23.63-12.36-23.63h-64.78c-13.4,0-20.12-16.21-10.64-25.68l56.72-56.72c2.82-2.82,6.65-4.41,10.64-4.41h117.75c7.88,0,14.46,6.07,15.01,13.93.38,5.36.57,10.76.57,16.22Z';

/**
 * O símbolo isolado da marca — o "G" desenhado, sem o "rana." que o
 * acompanha em `BrandLogotype`. Pensado pra caber num círculo pequeno
 * (avatar, favicon-like), onde o lockup inteiro não cabe/não lê.
 */
export default function BrandMark({ size = 24, color = theme.accent2 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} accessibilityLabel="Grana." role="img">
      <Path d={PATH_D} fill={color} />
    </Svg>
  );
}
