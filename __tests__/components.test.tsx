import { fireEvent, render } from '@testing-library/react-native';
import { ActiveSetInput } from '@/components/active-set-input';
import { ProgressChart } from '@/components/progress-chart';

describe('active set input', () => {
  test('accepts decimal kg, retains typing dots, and commits on blur', async () => {
    const onChange = jest.fn();
    const onBlur = jest.fn();
    const screen = await render(
      <ActiveSetInput value={80} field="kg" completed={false} onChange={onChange} onBlur={onBlur} />,
    );
    const input = screen.getByLabelText('Weight in kilograms');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '82.');
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '82.5');
    expect(onChange).toHaveBeenLastCalledWith(82.5);
    await fireEvent(input, 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  test('rounds reps to half steps and rejects zero', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <ActiveSetInput value={null} field="reps" completed={false} onChange={onChange} onBlur={jest.fn()} />,
    );
    const input = screen.getByLabelText('Repetitions');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '6.4');
    expect(onChange).toHaveBeenLastCalledWith(6.5);
    await fireEvent.changeText(input, '0');
    expect(onChange).toHaveBeenLastCalledWith(6.5);
  });
});

describe('progress chart', () => {
  test('renders its empty state', async () => {
    const screen = await render(<ProgressChart points={[]} metric="maxKg" />);
    expect(screen.getByText(/Complete sessions/)).toBeTruthy();
  });

  test('renders a chart for a single point without dividing by zero', async () => {
    const screen = await render(
      <ProgressChart
        metric="estimatedOneRm"
        points={[{ sessionId: 'one', startedAt: '2026-07-17T10:00:00Z', workoutName: 'Push', maxKg: 100, volume: 500, estimatedOneRm: 110 }]}
      />,
    );
    expect(screen.getByLabelText('Progress chart with 1 sessions')).toBeTruthy();
  });
});
