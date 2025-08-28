// Validation utility functions for forms

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Email validation
export const validateEmail = (email: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!email) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Username validation
export const validateUsername = (username: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!username) {
    errors.push('Username is required');
  } else {
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    
    if (username.length > 50) {
      errors.push('Username must be no more than 50 characters long');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, hyphens, and underscores');
    }
    
    if (/^[_-]|[_-]$/.test(username)) {
      errors.push('Username cannot start or end with hyphens or underscores');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Password validation
export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!password) {
    errors.push('Password is required');
  } else {
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Password confirmation validation
export const validatePasswordConfirmation = (
  password: string,
  confirmPassword: string
): ValidationResult => {
  const errors: string[] = [];
  
  if (!confirmPassword) {
    errors.push('Password confirmation is required');
  } else if (password !== confirmPassword) {
    errors.push('Passwords do not match');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Name validation (first name, last name)
export const validateName = (name: string, fieldName: string): ValidationResult => {
  const errors: string[] = [];
  
  if (name && name.length > 100) {
    errors.push(`${fieldName} must be no more than 100 characters long`);
  }
  
  if (name && !/^[a-zA-Z\s'-]+$/.test(name)) {
    errors.push(`${fieldName} can only contain letters, spaces, hyphens, and apostrophes`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Required field validation
export const validateRequired = (value: any, fieldName: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    errors.push(`${fieldName} is required`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// URL validation (for avatar URLs, etc.)
export const validateUrl = (url: string): ValidationResult => {
  const errors: string[] = [];
  
  if (url) {
    try {
      new URL(url);
      
      // Check if it's a valid HTTP/HTTPS URL
      if (!/^https?:\/\//i.test(url)) {
        errors.push('URL must start with http:// or https://');
      }
    } catch {
      errors.push('Please enter a valid URL');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Form validation composer
export const validateForm = (
  formData: Record<string, any>,
  validationRules: Record<string, (value: any) => ValidationResult>
): { isValid: boolean; errors: Record<string, string[]> } => {
  const errors: Record<string, string[]> = {};
  let isValid = true;
  
  for (const [field, validator] of Object.entries(validationRules)) {
    const result = validator(formData[field]);
    
    if (!result.isValid) {
      errors[field] = result.errors;
      isValid = false;
    }
  }
  
  return { isValid, errors };
};

// Specific form validators
export const validateLoginForm = (formData: {
  email: string;
  password: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  return validateForm(formData, {
    email: validateEmail,
    password: (password) => validateRequired(password, 'Password'),
  });
};

export const validateRegisterForm = (formData: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  const baseValidation = validateForm(formData, {
    email: validateEmail,
    username: validateUsername,
    password: validatePassword,
    firstName: (name) => validateName(name || '', 'First name'),
    lastName: (name) => validateName(name || '', 'Last name'),
  });
  
  // Add password confirmation validation
  const passwordConfirmation = validatePasswordConfirmation(
    formData.password,
    formData.confirmPassword
  );
  
  if (!passwordConfirmation.isValid) {
    baseValidation.errors.confirmPassword = passwordConfirmation.errors;
    baseValidation.isValid = false;
  }
  
  return baseValidation;
};

export const validateForgotPasswordForm = (formData: {
  email: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  return validateForm(formData, {
    email: validateEmail,
  });
};

export const validateResetPasswordForm = (formData: {
  password: string;
  confirmPassword: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  const baseValidation = validateForm(formData, {
    password: validatePassword,
  });
  
  // Add password confirmation validation
  const passwordConfirmation = validatePasswordConfirmation(
    formData.password,
    formData.confirmPassword
  );
  
  if (!passwordConfirmation.isValid) {
    baseValidation.errors.confirmPassword = passwordConfirmation.errors;
    baseValidation.isValid = false;
  }
  
  return baseValidation;
};

export const validateChangePasswordForm = (formData: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  const baseValidation = validateForm(formData, {
    currentPassword: (password) => validateRequired(password, 'Current password'),
    newPassword: validatePassword,
  });
  
  // Add password confirmation validation
  const passwordConfirmation = validatePasswordConfirmation(
    formData.newPassword,
    formData.confirmPassword
  );
  
  if (!passwordConfirmation.isValid) {
    baseValidation.errors.confirmPassword = passwordConfirmation.errors;
    baseValidation.isValid = false;
  }
  
  // Check if new password is different from current password
  if (formData.currentPassword && formData.newPassword && formData.currentPassword === formData.newPassword) {
    if (!baseValidation.errors.newPassword) {
      baseValidation.errors.newPassword = [];
    }
    baseValidation.errors.newPassword.push('New password must be different from current password');
    baseValidation.isValid = false;
  }
  
  return baseValidation;
};

export const validateUpdateProfileForm = (formData: {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}): { isValid: boolean; errors: Record<string, string[]> } => {
  return validateForm(formData, {
    firstName: (name) => validateName(name, 'First name'),
    lastName: (name) => validateName(name, 'Last name'),
    avatarUrl: (url) => url ? validateUrl(url) : { isValid: true, errors: [] },
  });
};

// Password strength checker
export const getPasswordStrength = (password: string): {
  score: number;
  feedback: string[];
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
} => {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');
  
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('Include numbers');
  
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
  else feedback.push('Include special characters');
  
  // Bonus points
  if (password.length >= 12) score += 1;
  if (/(.)\1{2,}/.test(password)) score -= 1; // Penalize repeated characters
  
  const strength = 
    score <= 1 ? 'very-weak' :
    score <= 2 ? 'weak' :
    score <= 3 ? 'fair' :
    score <= 4 ? 'good' : 'strong';
  
  return { score, feedback, strength };
};
