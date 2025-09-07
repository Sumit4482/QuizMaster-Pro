'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  QuestionFormData,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  Question,
  CategoryResponse,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  DEFAULT_QUESTION_FORM,
} from '@/types/question';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { questionUtils } from '@/utils/questionApi';

interface QuestionFormProps {
  question?: Question;
  categories: CategoryResponse[];
  onSubmit: (data: CreateQuestionRequest | UpdateQuestionRequest) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function QuestionForm({
  question,
  categories,
  onSubmit,
  onCancel,
  isLoading = false,
}: QuestionFormProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const isEditing = !!question;

  // Initialize form with default values or existing question data
  const getDefaultValues = (): QuestionFormData => {
    if (question) {
      return {
        questionText: question.questionText,
        questionType: question.questionType,
        multipleChoiceOptions: question.questionType === 'MULTIPLE_CHOICE'
          ? question.options?.options?.map((opt: string) => ({
              text: opt,
              isCorrect: opt === question.correctAnswer,
            }))
          : DEFAULT_QUESTION_FORM.multipleChoiceOptions,
        trueFalseAnswer: question.questionType === 'TRUE_FALSE' ? question.correctAnswer : undefined,
        textAnswer: question.questionType === 'TEXT_INPUT' ? question.correctAnswer : undefined,
        explanation: question.explanation || '',
        hints: question.hints || [],
        difficultyLevel: question.difficultyLevel,
        estimatedTime: question.estimatedTime,
        points: question.points,
        tags: question.tags,
        categoryIds: question.categories.map(c => c.id),
      };
    }
    return DEFAULT_QUESTION_FORM;
  };

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm<QuestionFormData>({
    defaultValues: getDefaultValues(),
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'multipleChoiceOptions',
  });

  const watchedValues = watch();
  const questionType = watchedValues.questionType;

  // Reset form when question changes
  useEffect(() => {
    reset(getDefaultValues());
  }, [question, reset]);

  // Handle question type change
  const handleQuestionTypeChange = (type: string) => {
    setValue('questionType', type as any);
    
    // Reset type-specific fields
    if (type === 'MULTIPLE_CHOICE') {
      replace(DEFAULT_QUESTION_FORM.multipleChoiceOptions!);
    } else if (type === 'TRUE_FALSE') {
      setValue('trueFalseAnswer', true);
    } else if (type === 'TEXT_INPUT') {
      setValue('textAnswer', '');
    }
  };

  // Add multiple choice option
  const addOption = () => {
    append({ text: '', isCorrect: false });
  };

  // Remove multiple choice option
  const removeOption = (index: number) => {
    if (fields.length > 2) {
      remove(index);
    }
  };

  // Handle form submission
  const onFormSubmit = async (data: QuestionFormData) => {
    try {
      // Convert form data to API format
      const requestData: CreateQuestionRequest = {
        questionText: data.questionText,
        questionType: data.questionType,
        correctAnswer: getCorrectAnswer(data),
        options: getQuestionOptions(data),
        difficultyLevel: data.difficultyLevel,
        estimatedTime: data.estimatedTime,
        points: data.points,
        tags: data.tags,
        categoryIds: data.categoryIds,
        ...(data.explanation && { explanation: data.explanation }),
        ...(data.hints?.length && { hints: data.hints.filter(h => h.trim()) }),
      };

      await onSubmit(requestData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  // Get correct answer based on question type
  const getCorrectAnswer = (data: QuestionFormData) => {
    switch (data.questionType) {
      case 'MULTIPLE_CHOICE':
        const correctIndices = data.multipleChoiceOptions
          ?.map((opt, index) => opt.isCorrect ? index : -1)
          .filter(index => index !== -1) || [];
        return {
          type: 'single',
          indices: correctIndices
        };
      case 'TRUE_FALSE':
        return {
          value: data.trueFalseAnswer
        };
      case 'TEXT_INPUT':
        return {
          type: 'exact',
          value: data.textAnswer || '',
          caseSensitive: false
        };
      default:
        return {};
    }
  };

  // Get question options based on type
  const getQuestionOptions = (data: QuestionFormData) => {
    if (data.questionType === 'MULTIPLE_CHOICE') {
      return {
        options: data.multipleChoiceOptions?.map(opt => opt.text) || [],
        shuffle: true,
      };
    }
    return undefined;
  };

  // Handle tag input
  const handleTagsChange = (tagString: string) => {
    const tags = questionUtils.parseTags(tagString);
    setValue('tags', tags);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Form Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
              {isEditing ? 'Edit Question' : 'Create New Question'}
            </h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Edit' : 'Preview'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {previewMode ? (
        // Preview Mode
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Question Preview</h3>
          </CardHeader>
          <CardContent>
            {/* Preview would use QuestionDisplay component */}
            <div className="p-4 border border-secondary-200 dark:border-secondary-700 rounded-lg bg-secondary-50 dark:bg-secondary-800">
              <p className="text-center text-secondary-600 dark:text-secondary-400">
                Question preview will be shown here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Edit Mode
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Basic Information</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Question Text */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Question Text *
                </label>
                <textarea
                  {...register('questionText', { required: 'Question text is required' })}
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                  placeholder="Enter your question..."
                />
                {errors.questionText && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.questionText.message}
                  </p>
                )}
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Question Type *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {QUESTION_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleQuestionTypeChange(type.value)}
                      className={`p-3 border-2 rounded-lg text-center transition-colors ${
                        questionType === type.value
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-secondary-300 dark:border-secondary-600 hover:border-primary-300 dark:hover:border-primary-600'
                      }`}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="text-sm font-medium">{type.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Categories *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto border border-secondary-300 dark:border-secondary-600 rounded-lg p-3">
                  {categories.map((category) => (
                    <label key={category.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        value={category.id}
                        {...register('categoryIds', { 
                          required: 'At least one category must be selected' 
                        })}
                        className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm truncate" title={category.name}>
                        {category.icon} {category.name}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.categoryIds && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.categoryIds.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Question Content */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Question Content</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Multiple Choice Options */}
              {questionType === 'MULTIPLE_CHOICE' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Answer Options *
                  </label>
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center space-x-3">
                        <input
                          type="radio"
                          {...register(`multipleChoiceOptions.${index}.isCorrect` as const)}
                          className="text-primary-600 focus:ring-primary-500"
                        />
                        <input
                          {...register(`multipleChoiceOptions.${index}.text` as const, {
                            required: 'Option text is required',
                          })}
                          className="flex-1 p-2 border border-secondary-300 dark:border-secondary-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                          placeholder={`Option ${index + 1}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeOption(index)}
                          disabled={fields.length <= 2}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addOption}
                      disabled={fields.length >= 6}
                    >
                      Add Option
                    </Button>
                  </div>
                </div>
              )}

              {/* True/False Answer */}
              {questionType === 'TRUE_FALSE' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Correct Answer *
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        value="true"
                        {...register('trueFalseAnswer', { required: 'Please select the correct answer' })}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span>True</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        value="false"
                        {...register('trueFalseAnswer', { required: 'Please select the correct answer' })}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span>False</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Text Input Answer */}
              {questionType === 'TEXT_INPUT' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Correct Answer *
                  </label>
                  <Input
                    {...register('textAnswer', { required: 'Correct answer is required' })}
                    placeholder="Enter the correct answer..."
                  />
                  <p className="mt-1 text-xs text-secondary-500">
                    For text questions, the answer will be matched case-insensitively
                  </p>
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Explanation (Optional)
                </label>
                <textarea
                  {...register('explanation')}
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                  placeholder="Explain why this is the correct answer..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Question Settings</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Difficulty Level */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    {...register('difficultyLevel')}
                    className="w-full p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                  >
                    {DIFFICULTY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Points */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Points
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    {...register('points', { 
                      min: { value: 1, message: 'Points must be at least 1' },
                      max: { value: 100, message: 'Points must be at most 100' }
                    })}
                  />
                </div>

                {/* Estimated Time */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Estimated Time (seconds)
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="300"
                    {...register('estimatedTime', {
                      min: { value: 5, message: 'Time must be at least 5 seconds' },
                      max: { value: 300, message: 'Time must be at most 300 seconds' }
                    })}
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Tags (Optional)
                </label>
                <Input
                  placeholder="Enter tags separated by commas (e.g., math, algebra, equations)"
                  value={questionUtils.formatTags(watchedValues.tags || [])}
                  onChange={(e) => handleTagsChange(e.target.value)}
                />
                <p className="mt-1 text-xs text-secondary-500">
                  Tags help organize and search questions
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-4 py-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLoading || !isDirty}
            >
              {isLoading ? 'Saving...' : isEditing ? 'Update Question' : 'Create Question'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
