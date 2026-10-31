import { toPoints } from './chart';

describe('toPoints', () => {
  it('maps the highest value to the top and the lowest to the bottom', () => {
    expect(toPoints([0, 10], 100, 50, 0)).toBe('0,50 100,0');
  });

  it('spreads points evenly across the width and respects padding', () => {
    expect(toPoints([1, 3, 2], 100, 20, 5)).toBe('0,15 50,5 100,10');
  });

  it('does not divide by zero for constant values', () => {
    expect(toPoints([5, 5], 10, 10, 0)).toBe('0,10 10,10');
  });
});
