import { config } from '../config';

export interface RateProviderResult {
  provider: string;
  model: string;
  rate_num: number;
  rate_reason: string;
  status: 'new' | '2Apply' | '2Delete';
}

export interface RateProvider {
  name: string;
  rate(input: {
    title: string;
    location: string;
    tags: string[];
    description: string;
    enrich_summary: string;
  }): Promise<RateProviderResult>;
}

function containsAny(text: string, needles: string[]): string[] {
  return needles.filter(function(needle) {
    return text.includes(needle);
  });
}

class RuleBasedRateProvider implements RateProvider {
  name = 'rule-based';

  async rate(input: {
    title: string;
    location: string;
    tags: string[];
    description: string;
    enrich_summary: string;
  }): Promise<RateProviderResult> {
    const haystack = [
      String(input.title || ''),
      String(input.location || ''),
      Array.isArray(input.tags) ? input.tags.join(' ') : '',
      String(input.description || ''),
      String(input.enrich_summary || '')
    ].join(' ').toLowerCase();

    const denyHits = containsAny(haystack, config.rateDenyKeywords);
    const targetHits = containsAny(haystack, config.rateTargetKeywords);

    let rateNum = 3;
    let status: 'new' | '2Apply' | '2Delete' = 'new';
    let rateReason = 'No target keywords matched';

    if (denyHits.length > 0) {
      rateNum = 1;
      status = '2Delete';
      rateReason = 'Deny keywords: ' + denyHits.join(', ');
    } else if (targetHits.length > 0) {
      rateNum = 4;
      status = '2Apply';
      rateReason = 'Target keywords: ' + targetHits.join(', ');
    }

    return {
      provider: this.name,
      model: 'rule-based-v1',
      rate_num: rateNum,
      rate_reason: rateReason,
      status: status
    };
  }
}

class GeminiStubRateProvider implements RateProvider {
  name = 'gemini';

  async rate(): Promise<RateProviderResult> {
    return {
      provider: this.name,
      model: 'gemini-stub',
      rate_num: 3,
      rate_reason: 'Gemini stub provider is not configured in local mode',
      status: 'new'
    };
  }
}

class GasFallbackRateProvider implements RateProvider {
  name = 'gas-fallback';

  async rate(): Promise<RateProviderResult> {
    return {
      provider: this.name,
      model: 'gas-fallback-stub',
      rate_num: 3,
      rate_reason: 'GAS fallback provider is not configured in local mode',
      status: 'new'
    };
  }
}

export function getRateProvider(): RateProvider {
  if (config.rateProvider === 'gemini') {
    return new GeminiStubRateProvider();
  }
  if (config.rateProvider === 'gas-fallback') {
    return new GasFallbackRateProvider();
  }
  return new RuleBasedRateProvider();
}
