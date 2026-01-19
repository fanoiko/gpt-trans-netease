import { getSetting } from './utils.js';


// from https://github.com/ztjhz/chatgpt-free-app
const getChatCompletionStreamInternal = async (apiEndpoint, apiKey, messages) => {
	let endpoint = apiEndpoint;
	if (!endpoint.endsWith('/')) {
		endpoint += '/';
	}

	const temperatureStr = String(getSetting('temperature', '0.8') || '0.8');
	const topPStr = String(getSetting('top-p', '') || '');

	const config = {
		presence_penalty: 0,
		stream: true
	};

	const temperature = parseFloat(temperatureStr);
	if (!isNaN(temperature) && temperature >= 0 && temperature <= 2) {
		config.temperature = temperature;
	}
	const topP = parseFloat(topPStr);
	if (!isNaN(topP) && topP >= 0 && topP <= 1) {
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
				'API 调用次数已达上限, 请检查配额或更换 API Key\n' + errorText
			);
		}

		throw new Error(errorText);
	}

	const contentType = response.headers.get('content-type');
	if (!contentType || !contentType.includes('text/event-stream')) {
		//console.warn('API 响应非流式格式, 降级处理; content-type:', contentType);
		const data = await response.json();
		return { nonStream: true, data };
	}

	const stream = response.body;
	if (!stream) {
		throw new Error('API 响应没有返回可读流');
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

// 检测API端点和KEY可用性
export const testApiConnection = async (apiEndpoint, apiKey, model) => {
	try {
		const endpointStr = String(apiEndpoint || '');
		if (!endpointStr) {
			return { success: false, error: 'API地址不能为空' };
		}

		try {
			new URL(endpointStr);
		} catch (e) {
			return { success: false, error: 'API地址不是一个正确的URL格式' };
		}

		if (!model || model.trim() === '') {
			return { success: false, error: '未填写模型名称' };
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

		const modelsResponse = await fetch(endpoint + 'models', {
			method: 'GET',
			headers: headers
		});

		if (modelsResponse.ok) {
			return { success: true };
		}

		const testMessages = [{ role: 'user', content: 'hi' }];
		const testConfig = {
			model: model,
			messages: testMessages,
			max_tokens: 1,
			stream: false
		};

		const chatResponse = await fetch(endpoint + 'chat/completions', {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(testConfig)
		});

		if (!chatResponse.ok) {
			const errorText = await chatResponse.text().catch(() => '无法读取错误信息');

			if (chatResponse.status === 401) {
				return { success: false, error: 'API密钥无效或过期' };
			} else if (chatResponse.status === 404 || chatResponse.status === 405) {
				return { success: false, error: 'API端点不存在或服务不可用' };
			} else if (chatResponse.status === 429) {
				return { success: false, error: 'API调用频率受限' };
			} else {
				return { success: false, error: `API连接失败 (${chatResponse.status})` };
			}
		}

		const data = await chatResponse.json().catch(() => null);
		if (data && (data.error || data.message)) {
			return { success: false, error: data.error || data.message };
		}

		return { success: true };
	} catch (error) {
		console.error('测试API连接时出错:', error);
		if (error.name === 'TypeError' && error.message.includes('fetch')) {
			return { success: false, error: '网络连接失败，请检查API地址和网络连接' };
		}
		return { success: false, error: `连接测试异常: ${error.message.split('\n')[0]}` };
	}
}