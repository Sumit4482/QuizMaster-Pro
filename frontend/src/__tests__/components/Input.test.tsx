import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/Input';

describe('Input Component', () => {
  it('should render input field', () => {
    render(<Input placeholder="Enter text" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Enter text');
  });

  it('should render with label', () => {
    render(<Input label="Username" />);
    
    const label = screen.getByText('Username');
    const input = screen.getByRole('textbox');
    
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', input.id);
  });

  it('should show required indicator', () => {
    render(<Input label="Email" required />);
    
    const requiredIndicator = screen.getByText('*');
    expect(requiredIndicator).toBeInTheDocument();
    expect(requiredIndicator).toHaveClass('text-error-500');
  });

  it('should display error message', () => {
    render(<Input label="Password" error="Password is required" />);
    
    const errorMessage = screen.getByText('Password is required');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveClass('form-error');
  });

  it('should display helper text', () => {
    render(<Input label="Username" helperText="Choose a unique username" />);
    
    const helperText = screen.getByText('Choose a unique username');
    expect(helperText).toBeInTheDocument();
    expect(helperText).toHaveClass('text-secondary-500');
  });

  it('should not show helper text when there is an error', () => {
    render(
      <Input 
        label="Username" 
        error="Username is taken"
        helperText="Choose a unique username" 
      />
    );
    
    expect(screen.getByText('Username is taken')).toBeInTheDocument();
    expect(screen.queryByText('Choose a unique username')).not.toBeInTheDocument();
  });

  it('should apply error styles', () => {
    render(<Input error="Invalid input" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-error-500', 'focus:border-error-500', 'focus:ring-error-500');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('should handle different input types', () => {
    const { rerender } = render(<Input inputType="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');

    rerender(<Input inputType="password" />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');

    rerender(<Input inputType="number" />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number');
  });

  it('should render left icon', () => {
    const LeftIcon = () => <span data-testid="left-icon">@</span>;
    
    render(<Input leftIcon={<LeftIcon />} />);
    
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('should render right icon', () => {
    const RightIcon = () => <span data-testid="right-icon">✓</span>;
    
    render(<Input rightIcon={<RightIcon />} />);
    
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('should adjust padding for icons', () => {
    const LeftIcon = () => <span data-testid="left-icon">@</span>;
    const RightIcon = () => <span data-testid="right-icon">✓</span>;
    
    const { rerender } = render(<Input leftIcon={<LeftIcon />} />);
    expect(screen.getByRole('textbox')).toHaveClass('pl-10');

    rerender(<Input rightIcon={<RightIcon />} />);
    expect(screen.getByRole('textbox')).toHaveClass('pr-10');

    rerender(<Input leftIcon={<LeftIcon />} rightIcon={<RightIcon />} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('pl-10', 'pr-10');
  });

  it('should handle value changes', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test value' } });
    
    expect(handleChange).toHaveBeenCalled();
  });

  it('should forward ref', () => {
    const ref = jest.fn();
    render(<Input ref={ref} />);
    
    expect(ref).toHaveBeenCalled();
  });

  it('should pass through HTML input props', () => {
    render(
      <Input 
        name="email"
        autoComplete="email"
        data-testid="email-input"
        maxLength={100}
      />
    );
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('data-testid', 'email-input');
    expect(input).toHaveAttribute('maxlength', '100');
  });

  it('should generate unique id when not provided', () => {
    const { rerender } = render(<Input />);
    const input1 = screen.getByRole('textbox');
    const id1 = input1.id;

    rerender(<Input />);
    const input2 = screen.getByRole('textbox');
    const id2 = input2.id;

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('should use provided id', () => {
    render(<Input id="custom-id" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'custom-id');
  });

  it('should set aria-describedby for error', () => {
    render(<Input id="test-input" error="Error message" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-error');
  });

  it('should set aria-describedby for helper text', () => {
    render(<Input id="test-input" helperText="Helper message" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-helper');
  });

  it('should accept custom className', () => {
    render(<Input className="custom-input" />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('custom-input');
    expect(input).toHaveClass('form-input'); // Should still have base classes
  });
});
