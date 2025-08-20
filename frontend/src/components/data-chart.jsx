import React from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip
} from 'chart.js'

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip)

export default function DataChart({ labels, data1, data2 }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Value 1',
        data: data1,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Value 2',
        data: data2,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      }
    ]
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        ticks: { maxTicksLimit: 10 }
      }
    }
  }
  return (
    <div className="h-64">
      <Line data={data} options={options} />
    </div>
  )
}
