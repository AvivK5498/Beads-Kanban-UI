/**
 * Database client for HTTP API operations
 *
 * Provides typed wrappers around API calls for projects, tags,
 * and their relationships.
 */

import type { Project, Tag } from '@/types';

import * as api from './api';

// ===== Input Types =====

export type { Project, Tag };

export interface CreateProjectInput {
  name: string;
  path: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  path?: string;
}

export interface CreateTagInput {
  name: string;
  color: string;
}

export interface UpdateTagInput {
  id: string;
  name?: string;
  color?: string;
}

// ===== Project Operations =====

/**
 * Gets all projects, ordered by last opened
 */
export async function getProjects(): Promise<Project[]> {
  return api.projects.list();
}

/**
 * Creates a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return api.projects.create(input);
}

/**
 * Updates an existing project
 */
export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const { id, ...data } = input;
  return api.projects.update(id, data);
}

/**
 * Deletes a project by ID
 */
export async function deleteProject(id: string): Promise<void> {
  return api.projects.delete(id);
}

// ===== Tag Operations =====

/**
 * Gets all tags
 */
export async function getTags(): Promise<Tag[]> {
  return api.tags.list();
}

/**
 * Creates a new tag
 */
export async function createTag(input: CreateTagInput): Promise<Tag> {
  return api.tags.create(input);
}

/**
 * Updates an existing tag
 */
export async function updateTag(input: UpdateTagInput): Promise<Tag> {
  const { id, ...data } = input;
  // Note: API doesn't have a separate update endpoint, using create for now
  // This would need backend support for tag updates
  return api.tags.create(data as CreateTagInput);
}

/**
 * Deletes a tag by ID
 */
export async function deleteTag(id: string): Promise<void> {
  return api.tags.delete(id);
}

// ===== Project-Tag Relationships =====

/**
 * Gets all tags for a specific project
 */
export async function getProjectTags(projectId: string): Promise<Tag[]> {
  const projects = await api.projects.list();
  const project = projects.find((p) => p.id === projectId);
  return project?.tags || [];
}

/**
 * Adds a tag to a project
 */
export async function addTagToProject(projectId: string, tagId: string): Promise<void> {
  return api.tags.addToProject(projectId, tagId);
}

/**
 * Removes a tag from a project
 */
export async function removeTagFromProject(projectId: string, tagId: string): Promise<void> {
  return api.tags.removeFromProject(projectId, tagId);
}

// ===== Convenience Functions =====

/**
 * Gets a project with its tags
 */
export async function getProjectWithTags(projectId: string): Promise<Project> {
  const projects = await getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}

/**
 * Gets all projects with their tags
 */
export async function getProjectsWithTags(): Promise<Project[]> {
  return getProjects();
}
