import { LineChart } from 'recharts';
import './chart.css';
import { ChartTooltip } from './chart-tooltip';

export function Chart() {
  return (
    <LineChart>
      <ChartTooltip />
    </LineChart>
  );
}
