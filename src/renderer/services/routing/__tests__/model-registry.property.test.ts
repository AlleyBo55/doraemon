import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ModelRegistry } from '../model-registry';
import { taskTypeArb, modelIdArb, invalidModelIdArb } from './generators';
import type { TaskType } from '../types';

describe('ModelRegistry Property Tests', () => {
  /**
   * Property 4: Model Registry Completeness
   * For any task type in the system, the Model_Registry SHALL have both
   * a primary model mapping and a fallback model mapping defined.
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 4: Model Registry Completeness', () => {
    it('every task type has a primary model mapping', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(taskTypeArb, (taskType: TaskType) => {
          const hasMapping = registry.hasMapping(taskType);
          const model = registry.getModel(taskType);

          expect(hasMapping).toBe(true);
          expect(model).toBeDefined();
          expect(model.id).toBeTruthy();
          expect(model.id.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('every task type has a fallback model mapping', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(taskTypeArb, (taskType: TaskType) => {
          const hasFallback = registry.hasFallback(taskType);
          const fallback = registry.getFallback(taskType);

          expect(hasFallback).toBe(true);
          expect(fallback).not.toBeNull();
          expect(fallback!.id).toBeTruthy();
        }),
        { numRuns: 100 }
      );
    });

    it('primary and fallback models are different for each task type', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(taskTypeArb, (taskType: TaskType) => {
          const primary = registry.getModel(taskType);
          const fallback = registry.getFallback(taskType);

          if (fallback) {
            expect(primary.id).not.toBe(fallback.id);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all task types are covered in registry', () => {
      const registry = new ModelRegistry();
      const allTaskTypes = registry.getAllTaskTypes();
      const expectedTaskTypes: TaskType[] = [
        'general_chat',
        'weather',
        'time',
        'web_search',
        'image_generation',
        'ide_activity',
        'notification',
        'task_management',
      ];

      expect(allTaskTypes).toHaveLength(expectedTaskTypes.length);
      expectedTaskTypes.forEach((taskType) => {
        expect(allTaskTypes).toContain(taskType);
      });
    });
  });


  /**
   * Property 5: Model Identifier Validation
   * For any model identifier in the Model_Registry, validation against known
   * OpenRouter models SHALL return valid for real model IDs and invalid for malformed IDs.
   * **Validates: Requirements 2.5**
   */
  describe('Property 5: Model Identifier Validation', () => {
    it('valid model IDs pass validation', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(modelIdArb, (modelId: string) => {
          const isValid = registry.isValidModelId(modelId);
          expect(isValid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('invalid model IDs fail validation', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(invalidModelIdArb, (modelId: string) => {
          const isValid = registry.isValidModelId(modelId);
          expect(isValid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('model IDs must contain provider/model format', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('/')),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('/')),
          (provider: string, model: string) => {
            const validId = `${provider}/${model}`;
            const isValid = registry.isValidModelId(validId);
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all registered models have valid IDs', () => {
      const registry = new ModelRegistry();
      const validation = registry.validateModels();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('known models are recognized', () => {
      const registry = new ModelRegistry();

      fc.assert(
        fc.property(modelIdArb, (modelId: string) => {
          const isKnown = registry.isKnownModel(modelId);
          expect(isKnown).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('empty or malformed IDs are rejected', () => {
      const registry = new ModelRegistry();

      const invalidCases = ['', ' ', 'noSlash', '/onlyModel', 'onlyProvider/', '//'];
      invalidCases.forEach((invalidId) => {
        expect(registry.isValidModelId(invalidId)).toBe(false);
      });
    });
  });
});
