import { getSetting } from './utils.js';


// from https://github.com/ztjhz/chatgpt-free-app
const getChatCompletionStreamInternal = async (apiEndpoint, apiKey, messages) => {
	let endpoint = apiEndpoint;
	if (!endpoint.endsWith('/')) {
		endpoint += '/';
	}

	const temperature = parseFloat(String(getSetting('temperature', '0.8') || '0.8'));
	const topP = parseFloat(String(getSetting('top-p', '-1') || '-1'));

	const config = {
		presence_penalty: 0,
		stream: true
	};

	if (temperature >= 0 && temperature <= 2) {
		config.temperature = temperature;
	}

	if (topP >= 0 && topP <= 1) {
		config.top_p = topP;
	}

	const headers = {
		'Content-Type': 'application/json'
	};

	if (apiKey && apiKey.trim() !== '') {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

	const response = await fetch(endpoint + 'chat/completions', {
		method: 'POST',
		headers: headers,
		body: JSON.stringify({
			model: String(getSetting('model', 'gpt-3.5-turbo') || 'gpt-3.5-turbo'),
			messages,
			...config
		})
	});

	if (!response.ok) {
		const errorText = await response.text();

		if (response.status === 404 || response.status === 405) {
			throw new Error(
				'无效的 API Endpoint, 请检查其是否正确设置或失效\n' + errorText
			);
		}

		if (response.status === 429 && errorText.includes('insufficient_quota')) {
			throw new Error(
				'API 调用次数已达上限, 请检查配额或更换API Key\n' + errorText
			);
		}

		throw new Error(errorText);
	}

	const contentType = response.headers.get('content-type');
	if (!contentType || !contentType.includes('text/event-stream')) {
		console.warn('API响应非流式格式, 降级处理; content-type:', contentType);
		const data = await response.json();
		return { nonStream: true, data };
	}

	const stream = response.body;
	if (!stream) {
		throw new Error('API响应没有返回可读流');
	}

	return stream;
}

export const getChatCompletionStream = async (messages) => {
	const apiEndpoint = getSetting('api-endpoint', 'https://api.openai.com/v1/');
	const apiKey = getSetting('api-key', '');

	const endpoint = String(apiEndpoint || '');

	try {
		new URL(endpoint);
	} catch (e) {
		throw new Error('API Endpoint 不是一个正确的 URL, 请前往设置中检查');
	}

	return getChatCompletionStreamInternal(endpoint, apiKey, messages);
}

// 获取可用模型列表
export const getAvailableModels = async (apiEndpoint, apiKey) => {
	try {
		const endpointStr = String(apiEndpoint || '');
		if (!endpointStr) {
			return [];
		}

		let endpoint = endpointStr;
		if (!endpoint.endsWith('/')) {
			endpoint += '/';
		}

		const headers = {
			'Content-Type': 'application/json'
		};

		if (apiKey && apiKey.trim() !== '') {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		const response = await fetch(endpoint + 'models', {
			method: 'GET',
			headers: headers
		});

		if (!response.ok) {
			return [];
		}

		const data = await response.json();

		if (data && data.data && Array.isArray(data.data)) {
			return data.data.map(model => model.id).sort();
		}

		if (Array.isArray(data)) {
			return data.map(model => model.id || model).sort();
		}

		return [];
	} catch (error) {
		return [];
	}
}