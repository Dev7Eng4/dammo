import {
  createGpmGroup,
  createGpmProfile,
  deleteGpmGroup,
  deleteGpmProfile,
  getGpmGroup,
  getGpmProfile,
  listGpmGroups,
  listGpmProfiles,
  pingGpm,
  startGpmProfile,
  stopGpmProfile,
  updateGpmGroup,
  updateGpmProfile,
} from '../../infrastructure/gpm/gpm-api.client.js';
import type {
  GpmCreateGroupInput,
  GpmCreateProfileInput,
  GpmListQuery,
  GpmStartProfileOptions,
  GpmUpdateGroupInput,
  GpmUpdateProfileInput,
} from './gpm-manager.types.js';

export class GpmManagerService {
  getStatus() {
    return pingGpm();
  }

  listProfiles(query: GpmListQuery) {
    return listGpmProfiles(query);
  }

  getProfile(id: string) {
    return getGpmProfile(id);
  }

  createProfile(input: GpmCreateProfileInput) {
    return createGpmProfile(input);
  }

  updateProfile(id: string, input: GpmUpdateProfileInput) {
    return updateGpmProfile(id, input);
  }

  deleteProfile(id: string, mode: 'soft' | 'hard') {
    return deleteGpmProfile(id, mode);
  }

  startProfile(id: string, options: GpmStartProfileOptions) {
    return startGpmProfile(id, options);
  }

  stopProfile(id: string) {
    return stopGpmProfile(id);
  }

  listGroups(query: GpmListQuery) {
    return listGpmGroups(query);
  }

  getGroup(id: string) {
    return getGpmGroup(id);
  }

  createGroup(input: GpmCreateGroupInput) {
    return createGpmGroup(input);
  }

  updateGroup(id: string, input: GpmUpdateGroupInput) {
    return updateGpmGroup(id, input);
  }

  deleteGroup(id: string) {
    return deleteGpmGroup(id);
  }
}

export const gpmManagerService = new GpmManagerService();
