import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { anything, instance, mock, verify } from 'ts-mockito';

import { BuildStep } from '../BuildStep.js';
import { BuildStepEnv } from '../BuildStepEnv.js';
import { BuildWorkflow } from '../BuildWorkflow.js';

import { createMockContext } from './utils/context.js';

describe(BuildWorkflow, () => {
  describe(BuildWorkflow.prototype.executeAsync, () => {
    it('executes all steps passed to the constructor', async () => {
      const mockBuildStep1 = mock<BuildStep>();
      const mockBuildStep2 = mock<BuildStep>();
      const mockBuildStep3 = mock<BuildStep>();
      const mockBuildStep4 = mock<BuildStep>();

      const buildSteps: BuildStep[] = [
        instance(mockBuildStep1),
        instance(mockBuildStep2),
        instance(mockBuildStep3),
      ];

      const ctx = createMockContext();
      const workflow = new BuildWorkflow(ctx, { buildSteps, buildFunctions: {} });
      await workflow.executeAsync();

      verify(mockBuildStep1.executeAsync(anything())).once();
      verify(mockBuildStep2.executeAsync(anything())).once();
      verify(mockBuildStep3.executeAsync(anything())).once();
      verify(mockBuildStep4.executeAsync(anything())).never();
    });

    it('executes steps in correct order', async () => {
      const mockBuildStep1 = mock<BuildStep>();
      const mockBuildStep2 = mock<BuildStep>();
      const mockBuildStep3 = mock<BuildStep>();

      const buildSteps: BuildStep[] = [
        instance(mockBuildStep1),
        instance(mockBuildStep3),
        instance(mockBuildStep2),
      ];

      const ctx = createMockContext();
      const workflow = new BuildWorkflow(ctx, { buildSteps, buildFunctions: {} });
      await workflow.executeAsync();

      verify(mockBuildStep1.executeAsync(anything())).calledBefore(
        mockBuildStep3.executeAsync(anything())
      );
      verify(mockBuildStep3.executeAsync(anything())).calledBefore(
        mockBuildStep2.executeAsync(anything())
      );
      verify(mockBuildStep2.executeAsync(anything())).once();
    });

    it('executes steps with environment variables passed to the workflow', async () => {
      const mockBuildStep1 = mock<BuildStep>();
      const mockBuildStep2 = mock<BuildStep>();
      const mockBuildStep3 = mock<BuildStep>();

      const buildSteps: BuildStep[] = [
        instance(mockBuildStep1),
        instance(mockBuildStep3),
        instance(mockBuildStep2),
      ];

      const mockEnv: BuildStepEnv = { ABC: '123' };

      const ctx = createMockContext();
      const workflow = new BuildWorkflow(ctx, { buildSteps, buildFunctions: {} });
      await workflow.executeAsync(mockEnv);

      verify(mockBuildStep1.executeAsync(mockEnv));
      verify(mockBuildStep2.executeAsync(mockEnv));
      verify(mockBuildStep3.executeAsync(mockEnv));
    });
  });
  describe(BuildWorkflow.prototype.collectArtifactsAsync, () => {
    it(
      'returns build artifacts',
      async () => {
        const ctx = createMockContext();
        const originalFilesDirectoryPath = path.join(os.tmpdir(), 'eas-steps-test-fixtures');
        const originalApplicationArchivePath = path.join(originalFilesDirectoryPath, 'app.ipa');
        const originalBuildArtifactPath1 = path.join(originalFilesDirectoryPath, 'screenshot1.png');
        const originalBuildArtifactPath2 = path.join(originalFilesDirectoryPath, 'screenshot2.png');

        try {
          await Promise.all([
            fs.mkdir(ctx.workingDirectory, { recursive: true }),
            fs.mkdir(originalFilesDirectoryPath, { recursive: true }),
          ]);
          await Promise.all([
            fs.writeFile(originalApplicationArchivePath, 'abc123'),
            fs.writeFile(originalBuildArtifactPath1, 'def456'),
            fs.writeFile(originalBuildArtifactPath2, 'ghi789'),
          ]);

          const buildSteps: BuildStep[] = [
            new BuildStep(ctx, {
              id: 'test1',
              command: `upload-artifact --type application-archive ${originalApplicationArchivePath}`,
              workingDirectory: ctx.workingDirectory,
            }),
            new BuildStep(ctx, {
              id: 'test2',
              command: `upload-artifact --type build-artifact ${originalBuildArtifactPath1}`,
              workingDirectory: ctx.workingDirectory,
            }),
            new BuildStep(ctx, {
              id: 'test3',
              command: `upload-artifact --type build-artifact ${originalBuildArtifactPath2}`,
              workingDirectory: ctx.workingDirectory,
            }),
          ];

          const workflow = new BuildWorkflow(ctx, { buildSteps, buildFunctions: {} });
          await workflow.executeAsync();

          const artifacts = await workflow.collectArtifactsAsync();
          expect(artifacts['application-archive']?.length).toBe(1);
          expect(artifacts['build-artifact']?.length).toBe(2);
          expect(artifacts['application-archive']?.[0].endsWith('app.ipa')).toBeTruthy();
          expect(artifacts['build-artifact']?.[0].endsWith('screenshot1.png')).toBeTruthy();
          expect(artifacts['build-artifact']?.[1].endsWith('screenshot2.png')).toBeTruthy();
        } finally {
          await Promise.all([
            fs.rm(ctx.baseWorkingDirectory, { recursive: true, force: true }),
            fs.rm(originalFilesDirectoryPath, { recursive: true, force: true }),
          ]);
        }
      },
      // use longer timeout because this test spawns ts-node
      20 * 1000
    );

    it('returns empty object if no artifacts have been uploaded', async () => {
      const ctx = createMockContext();

      const workflow = new BuildWorkflow(ctx, { buildSteps: [], buildFunctions: {} });
      await workflow.executeAsync();

      const artifacts = await workflow.collectArtifactsAsync();
      expect(Object.keys(artifacts).length).toBe(0);
    });
  });
});
