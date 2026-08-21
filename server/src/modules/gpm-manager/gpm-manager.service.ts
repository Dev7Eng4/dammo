import {
  createGpmProfile,
  deleteGpmProfile,
  getGpmProfile,
  listGpmProfiles,
  pingGpm,
  startGpmProfile,
  stopGpmProfile,
  updateGpmProfile,
  type GpmGroup,
  type GpmPaginated,
  type GpmProfile,
} from '../../infrastructure/gpm/gpm-api.client.js';
import { resolveGpmProfileIdByEmail } from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { AppError } from '../../shared/http/errors.js';
import { gpmGroupsRepository } from './gpm-groups.repository.js';
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

function paginateGroups(groups: GpmGroup[], query: GpmListQuery = {}): GpmPaginated<GpmGroup> {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = query.page_size && query.page_size > 0 ? query.page_size : groups.length || 30;
  const search = query.search?.trim().toLowerCase();

  const filtered = search
    ? groups.filter((group) => group.name.toLowerCase().includes(search))
    : groups;

  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return {
    data,
    current_page: page,
    per_page: pageSize,
    total,
    last_page: lastPage,
  };
}

export class GpmManagerService {
  getStatus() {
    return pingGpm();
  }

  private mergeLocalProfileState(profile: GpmProfile): GpmProfile {
    const caps = gpmProfileCapabilitiesRepository.get(profile.id);
    return {
      ...profile,
      group_id: caps.groupId ?? '',
      flowEnabled: caps.flowEnabled,
      metaEnabled: caps.metaEnabled,
    };
  }

  private assertGroupExists(groupId: string | null | undefined): void {
    if (groupId == null || groupId === '') return;
    if (!gpmGroupsRepository.findById(groupId)) {
      throw new AppError(`GPM group not found: ${groupId}`, 404, 'NOT_FOUND');
    }
  }

  private withoutGroupId<T extends { group_id?: string | null }>(
    input: T,
  ): Omit<T, 'group_id'> {
    const { group_id: _groupId, ...rest } = input;
    return rest;
  }

  listProfiles(query: GpmListQuery) {
    const { group_id: groupIdFilter, ...gpmQuery } = query;
    return listGpmProfiles(gpmQuery).then((item) => {
      let data = item.data.map((profile) => this.mergeLocalProfileState(profile));
      if (groupIdFilter?.trim()) {
        data = data.filter((profile) => profile.group_id === groupIdFilter.trim());
      }
      return {
        ...item,
        data,
        total: groupIdFilter?.trim() ? data.length : item.total,
      };
    });
  }

  async listMetaEnabledProfiles(): Promise<GpmProfile[]> {
    const page = await this.listProfiles({ page: 1, page_size: 100 });
    return page.data.filter((profile) => profile.metaEnabled === true);
  }

  getProfile(id: string) {
    return getGpmProfile(id).then((profile) => this.mergeLocalProfileState(profile));
  }

  async createProfile(input: GpmCreateProfileInput) {
    this.assertGroupExists(input.group_id);
    const profile = await createGpmProfile(this.withoutGroupId(input));
    if (input.group_id !== undefined) {
      gpmProfileCapabilitiesRepository.set(profile.id, {
        groupId: input.group_id || null,
      });
    }
    return this.mergeLocalProfileState(profile);
  }

  async updateProfile(id: string, input: GpmUpdateProfileInput) {
    this.assertGroupExists(input.group_id);
    const profile = await updateGpmProfile(id, this.withoutGroupId(input));
    if (input.group_id !== undefined) {
      gpmProfileCapabilitiesRepository.set(id, {
        groupId: input.group_id || null,
      });
    }
    return this.mergeLocalProfileState(profile);
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

  async startProfileByEmail(email: string, options: GpmStartProfileOptions = {}) {
    const profileId = await resolveGpmProfileIdByEmail(email);
    return this.startProfile(profileId, options);
  }

  stopProfile(id: string) {
    return stopGpmProfile(id);
  }

  listGroups(query: GpmListQuery) {
    return paginateGroups(gpmGroupsRepository.findAll(), query);
  }

  getGroup(id: string) {
    const group = gpmGroupsRepository.findById(id);
    if (!group) {
      throw new AppError(`GPM group not found: ${id}`, 404, 'NOT_FOUND');
    }
    return group;
  }

  createGroup(input: GpmCreateGroupInput) {
    return gpmGroupsRepository.create(input);
  }

  updateGroup(id: string, input: GpmUpdateGroupInput) {
    return gpmGroupsRepository.update(id, input);
  }

  deleteGroup(id: string) {
    gpmGroupsRepository.remove(id);
    gpmProfileCapabilitiesRepository.clearGroupId(id);
  }
}

export const gpmManagerService = new GpmManagerService();
