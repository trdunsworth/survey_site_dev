import React from 'react';
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