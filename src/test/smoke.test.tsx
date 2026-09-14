import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

/**
 * Boot smoke test: the whole provider + router tree must mount without
 * throwing. With a fresh database the onboarding screen should appear.
 */
describe('app boot', () => {
  it('renders onboarding on first run', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/set up your business/i)).toBeTruthy(), {
      timeout: 5000,
    });
  });
});
