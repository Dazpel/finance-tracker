import React, { useEffect, useRef } from 'react';
import { Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(PieController, ArcElement, Tooltip, Legend);

const PieChart = ({ data, onSectionClick }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = chartRef?.current.getContext('2d');
    const chartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: data.labels,
        datasets: [
          {
            data: data.values,
            backgroundColor: data.colors,
          },
        ],
      },
      options: {
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            onSectionClick(index);
          }
        },
      },
    });

    return () => {
      chartInstance.destroy();
    };
  }, [data, onSectionClick]);

  return <div className='flex h-80 w-80'><canvas ref={chartRef} /></div>;
};

export default PieChart;