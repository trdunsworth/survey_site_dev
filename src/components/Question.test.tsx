import { render, screen } from '@testing-library/react';
import Question from './Question';

describe('Question response emphasis', () => {
  it('renders optional response emphasis text in the highlighted style', () => {
    render(
      <Question
        question={{
          id: 1,
          text: 'How many people work here?',
          type: 'text',
          responseEmphasis: 'Enter a whole-number headcount.',
        }}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Enter a whole-number headcount.')).toHaveClass('question-response-emphasis');
  });
});

describe('Question info text links', () => {
  it('renders HTTPS Markdown links as accessible links', () => {
    render(
      <Question
        question={{
          id: 0.1,
          text: 'Find demographic data at the [U.S. Census Bureau](https://www.census.gov).',
          type: 'info',
        }}
        value={undefined}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: 'U.S. Census Bureau' })).toHaveAttribute(
      'href',
      'https://www.census.gov'
    );
  });

  it('renders non-HTTPS Markdown destinations as plain text', () => {
    const { container } = render(
      <Question
        question={{
          id: 0.1,
          text: 'Do not open [this link](javascript:alert).',
          type: 'info',
        }}
        value={undefined}
        onChange={vi.fn()}
      />
    );

    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.textContent).toContain('[this link](javascript:alert)');
  });
});