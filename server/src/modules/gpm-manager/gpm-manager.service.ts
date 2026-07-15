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
  type GpmProfile,
} from '../../infrastructure/gpm/gpm-api.client.js';
import {
  gpmProfileCapabilitiesRepository,
  type GpmProfileCapabilitiesPatch,
} from './gpm-profile-capabilities.repository.js';
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

  private mergeCapabilities(profile: GpmProfile): GpmProfile {
    const caps = gpmProfileCapabilitiesRepository.get(profile.id);
    return {
      ...profile,
      flowEnabled: caps.flowEnabled,
      metaEnabled: caps.metaEnabled,
    };
  }

  listProfiles(query: GpmListQuery) {
    return listGpmProfiles(query).then((item) => ({
      ...item,
      data: item.data.map((profile) => this.mergeCapabilities(profile)),
    }));
  }

  async listMetaEnabledProfiles(): Promise<GpmProfile[]> {
    const page = await this.listProfiles({ page: 1, page_size: 100 });
    return page.data.filter((profile) => profile.metaEnabled === true);
  }

  getProfile(id: string) {
    return getGpmProfile(id).then((profile) => this.mergeCapabilities(profile));
  }

  createProfile(input: GpmCreateProfileInput) {
    return createGpmProfile(input).then((profile) => this.mergeCapabilities(profile));
  }

  updateProfile(id: string, input: GpmUpdateProfileInput) {
    return updateGpmProfile(id, input).then((profile) => this.mergeCapabilities(profile));
  }

  async updateCapabilities(id: string, patch: GpmProfileCapabilitiesPatch) {
    await getGpmProfile(id);
    gpmProfileCapabilitiesRepository.set(id, patch);
    return this.getProfile(id);
  }

  async deleteProfile(id: string, mode: 'soft' | 'hard') {
    await deleteGpmProfile(id, mode);
    gpmProfileCapabilitiesRepository.remove(id);
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
