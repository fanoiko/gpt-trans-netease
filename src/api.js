import { getSetting, setSetting } from './utils.js';


// from https://github.com/ztjhz/chatgpt-free-app
const getChatCompletionStreamInternal = async (apiEndpoint, apiKey, messages) => {
	let endpoint = apiEndpoint;
	if (!endpoint.endsWith('/')) {
		endpoint += '/';
	}

	const temperature = parseFloat(getSetting('temperature', '0.8'));
	const topP = parseFloat(getSetting('top-p', '-1'));

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
			model: getSetting('model', 'gpt-3.5-turbo'),
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
		console.warn('API响应不是流式格式，content-type:', contentType);
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
	console.log('using api', apiEndpoint);

	try {
		new URL(apiEndpoint);
	} catch (e) {
		throw new Error('API Endpoint 不是一个正确的 URL, 请前往设置中检查');
	}

	return getChatCompletionStreamInternal(apiEndpoint, apiKey, messages);
}