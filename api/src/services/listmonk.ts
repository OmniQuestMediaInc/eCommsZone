import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { AppError } from '../middleware/errorHandler';

interface SubscribePayload {
  email: string;
  name?: string;
  listIds: number[];
  attributes?: Record<string, unknown>;
}

interface SubscribeResult {
  subscriberId: number;
  status: string;
}

interface CampaignResult {
  campaignId: number;
  status: string;
}

class ListmonkService {
  private client: AxiosInstance;

  constructor() {
    const auth = Buffer.from(
      `${process.env.LISTMONK_USERNAME ?? 'admin'}:${process.env.LISTMONK_PASSWORD ?? 'changeme'}`,
    ).toString('base64');

    this.client = axios.create({
      baseURL: `${process.env.LISTMONK_BASE_URL ?? 'http://listmonk:9000'}/api`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  async subscribe(payload: SubscribePayload): Promise<SubscribeResult> {
    try {
      const res = await this.client.post('/subscribers', {
        email: payload.email,
        name: payload.name ?? payload.email,
        status: 'enabled',
        lists: payload.listIds,
        attribs: payload.attributes ?? {},
        preconfirm_subscriptions: true,
      });
      const data = (res.data as { data?: { id?: number; status?: string } }).data ?? {};
      return {
        subscriberId: data.id ?? 0,
        status: data.status ?? 'enabled',
      };
    } catch (err) {
      logger.error('listmonk subscribe error', { err });
      throw new AppError(502, 'UPSTREAM_ERROR', 'Failed to subscribe via listmonk');
    }
  }

  private async findSubscriberId(email: string): Promise<number | null> {
    // Use listmonk's server-side search with a parameterized query filter
    const res = await this.client.get('/subscribers', {
      params: {
        query: "subscribers.email = ?",
        queryBinds: JSON.stringify([email]),
        page: 1,
        per_page: 1,
      },
    });
    const results = (res.data as { data?: { results?: Array<{ id: number }> } }).data?.results ?? [];
    return results.length > 0 ? results[0].id : null;
  }

  async unsubscribe(email: string, listIds?: number[]): Promise<void> {
    try {
      const subId = await this.findSubscriberId(email);
      if (subId === null) return;

      if (listIds?.length) {
        await this.client.delete(`/subscribers/${subId}/lists`, {
          data: { ids: listIds },
        });
      } else {
        await this._blocklistById(subId);
      }
    } catch (err) {
      logger.error('listmonk unsubscribe error', { err });
      throw new AppError(502, 'UPSTREAM_ERROR', 'Failed to unsubscribe via listmonk');
    }
  }

  async blocklistSubscriber(email: string): Promise<void> {
    try {
      const subId = await this.findSubscriberId(email);
      if (subId === null) return;
      await this._blocklistById(subId);
      logger.info('Subscriber blocklisted', { email });
    } catch (err) {
      logger.error('listmonk blocklist error', { err });
    }
  }

  private async _blocklistById(subId: number): Promise<void> {
    await this.client.put(`/subscribers/${subId}`, { status: 'blocklisted' });
  }

  async triggerCampaign(
    campaignId: number,
    sendAt?: string,
  ): Promise<CampaignResult> {
    try {
      if (sendAt) {
        await this.client.put(`/campaigns/${campaignId}`, {
          send_at: sendAt,
        });
        await this.client.put(`/campaigns/${campaignId}/status`, { status: 'scheduled' });
        return { campaignId, status: 'scheduled' };
      }

      await this.client.put(`/campaigns/${campaignId}/status`, { status: 'running' });
      return { campaignId, status: 'running' };
    } catch (err) {
      logger.error('listmonk triggerCampaign error', { err });
      throw new AppError(502, 'UPSTREAM_ERROR', 'Failed to trigger campaign via listmonk');
    }
  }
}

export const listmonkService = new ListmonkService();
