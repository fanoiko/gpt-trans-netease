import './style.scss'
import { initUI } from './ui.js'
import { getChatCompletionStream } from './api.js'
import { Settings } from './settings.js'
import { getSetting, DEFAULT_PROMPT } from './utils.js'
import { createRoot } from 'react-dom/client'

const parseEventSource = (data) => {
	const result = data
		.split('\n\n')
		.filter(Boolean)
		.map((chunk) => {
			const jsonString = chunk
				.split('\n')
				.map((line) => line.replace(/^data: /, ''))
				.join('');
			if (jsonString === '[DONE]') return jsonString;
			try {
				const json = JSON.parse(jsonString);
				return json;
			} catch {
				return '[ERROR]';
			}
		});
	return result;
};

const getGPTTranslation = async (originalLyrics, onStream, onDone, taskID) => {
	const model = getSetting('model');
	const encodedLyrics = originalLyrics.map((x, i) => `${i+1}. ${x.trim()}`).join('\n');

	const customPrompt = getSetting('prompt');
	const finalPrompt = (customPrompt || '').replace('{lyrics}', encodedLyrics);

	const response = await getChatCompletionStream([
		{ content: finalPrompt, role: "user"}
	]);

	if (!response) {
		throw new Error('API 调用失败，返回值为空');
	}

	if ('nonStream' in response && response.nonStream) {
		let fakeProgress = 0;
		const fakeProgressInterval = setInterval(() => {
			fakeProgress += 4.75;
			if (fakeProgress > 95) fakeProgress = 95;
			document.dispatchEvent(new CustomEvent('gpt-task-progress', {
				detail: { taskID, progress: fakeProgress }
			}));
		}, 1000);

		const content = response.data.choices[0].message.content;
		onStream(content);
		clearInterval(fakeProgressInterval);
		document.dispatchEvent(new CustomEvent('gpt-task-progress', {
			detail: { taskID, progress: 100 }
		}));
		onDone(model);
		return;
	}

	if (!('getReader' in response)) {
		throw new Error('API 返回了不支持的类型');
	}

	const reader = response.getReader();
	while (true) {
		const {done, value} = await reader.read();
		const result = parseEventSource(new TextDecoder().decode(value));
		if (result === '[DONE]' || done) {
			break;
		}
		const resultString = result.reduce((output, cur) => {
			if (typeof(cur) === 'string'){
				return output;
			} else {
				const content = cur.choices[0].delta.content;
				if (content) output += content;
				return output;
			}
		}, '');
		onStream(resultString);
	}
	onDone(model);
}
const getLocalGPTTranslation = async (lyricsData, onStream, onDone, hash) => {
	if (lyricsData.Lyrics && typeof lyricsData.Lyrics === 'object') {
		const lyricsObj = lyricsData.Lyrics;
		const lines = Object.keys(lyricsObj)
			.sort((a, b) => parseInt(a) - parseInt(b))
			.map(key => `${key}. ${lyricsObj[key]}`);
		onStream(lines.join('\n'));
	} else {
		try {
			await betterncm.fs.unlink(`gpt-translated-lyrics/${hash}.txt`);
		} catch (error) {
			console.error(error);
		}
	}
	onDone();
}

const simulateGPTTranslation = async (originalLyrics, onStream, onDone) => {
	let lastTime = Date.now(), cnt = 0;
	const interval = setInterval(() => {
		const resultString = cnt % 5 === 0 ? '\n' : '测试翻译';
		onStream(resultString);
		cnt++;
		if (cnt > 60) {
			clearInterval(interval);
			onDone();
		}
	}, 300);
}

const shouldTranslate = (originalLyrics) => {
	const filteredLyrics = originalLyrics.filter((x) => {
		return !/^作.+\s*[:：]/.test(x.trim()) && !/^编曲\s*[:：]/.test(x.trim());
	});
	const hasChinese = filteredLyrics.some((x) => /[\u4e00-\u9fa5]/.test(x));
	const hasJapanese = filteredLyrics.some((x) => /[\u3040-\u30ff]/.test(x));
	const hasKorean = filteredLyrics.some((x) => /[\uac00-\ud7a3]/.test(x));
	const hasEnglish = filteredLyrics.some((x) => /[a-zA-Z]/.test(x));
	if (hasChinese) {
		return (hasJapanese || hasKorean);
	} else {
		return (hasEnglish || hasJapanese || hasKorean);
	}
}

const onLyricsUpdate = async (e) => {
	document.body.classList.remove('can-genereate-gpt-translation');
	if (!e.detail) {
		return;
	}
	if (e.detail.amend) {
		return;
	}
	if (e.detail.lyrics.some((x) => x.translatedLyric)) {
		return;
	}
	let originalLyrics = [], mapping = [];
	for (let index in e.detail.lyrics) {
		const line = e.detail.lyrics[index];
		if (!line?.originalLyric?.trim()) continue;
		if (/^作.+\s*[:：]/.test(line.originalLyric.trim())) continue;
		if (/^编曲\s*[:：]/.test(line.originalLyric.trim())) continue;

		originalLyrics.push(line.originalLyric.trim());
		mapping.push(index);
	}
	if (!originalLyrics.length) {
		return;
	}
	if (!shouldTranslate(originalLyrics)) {
		return;
	}

	const hash = e.detail.hash;
	const taskID = +new Date();
	const songID = betterncm.ncm.getPlaying().id;
	const songName = betterncm.ncm.getPlaying().title;
	const lyrics = e.detail.lyrics;

	let localLyrics = await getLocalLyrics(hash);
	if (localLyrics) {
		try {
			localLyrics = JSON.parse(localLyrics);

			// 版本兼容
			if (localLyrics.version === 2) {
			} else {
				localLyrics = {
					model: 'gpt-3.5-turbo',
					temperature: 0.8,
					topP: -1,
					Lyrics: parseLyricsToObject(typeof localLyrics === 'string' ? localLyrics : ''),
					prompt: DEFAULT_PROMPT,
					version: 2,
					savedAt: new Date().toISOString()
				};
			}
		} catch {
			localLyrics = {
				model: 'gpt-3.5-turbo',
				temperature: 0.8,
				topP: -1,
				Lyrics: parseLyricsToObject(localLyrics),
				prompt: DEFAULT_PROMPT,
				version: 2,
				savedAt: new Date().toISOString()
			};
		}
	}

	const model = localLyrics?.model ?? getSetting('model');
	const currentModel = getSetting('model');
	const currentPrompt = getSetting('prompt');
	const currentTemperature = parseFloat(getSetting('temperature'));
	const currentTopP = parseFloat(getSetting('top-p'));

	const configMatches = localLyrics &&
		localLyrics.model === currentModel &&
		localLyrics.prompt === currentPrompt &&
		Math.abs((localLyrics.temperature || 0.8) - currentTemperature) < 0.01 &&
		Math.abs((localLyrics.topP || -1) - currentTopP) < 0.01;

	//console.log('local gpt-translated lyrics', localLyrics);

	let curIndex = 0;
	let buffer = '\n', fullGPTResponse = '';
	const onStream = (resultString) => {
		for (let char of resultString) {
			fullGPTResponse += char;
			if (char === '\n') {
				buffer = '';
				if (lyrics[mapping[curIndex]]?.translatedLyric) curIndex++;
				document.dispatchEvent(new CustomEvent('gpt-task-progress', { detail: { taskID, progress: curIndex / mapping.length * 100 }}));
			}
			buffer += char;
			if (buffer[0] === '\n') {
				if (/^\n\d+\./.test(buffer)) {
					buffer = '';
				}
			} else {
				if (mapping[curIndex] && lyrics[mapping[curIndex]]) {
					lyrics[mapping[curIndex]].translatedLyric = ((lyrics[mapping[curIndex]].translatedLyric ?? '') + char).trimStart();
				}
			}
		}
		if (window.currentLyrics?.hash === hash) {
			window.currentLyrics.lyrics = lyrics;
			window.currentLyrics.amend = true;
			window.currentLyrics.contributors.translation = { name: model };
			document.dispatchEvent(new CustomEvent('lyrics-updated', {detail: window.currentLyrics}));
		}
		//console.log(fullGPTResponse);
	}
	const onDone = async (model) => {
		//console.log('done');
		if (!localLyrics) {
			await saveLocalLyrics(hash, fullGPTResponse, model);
		}
		document.dispatchEvent(new CustomEvent('gpt-task-done', { detail: { taskID }}));
	}
	if (localLyrics) {
		await getLocalGPTTranslation(localLyrics, onStream, onDone, hash);
		// 缓存与配置不符时显示翻译按钮
		if (configMatches) {
			return;
		}
	}
	document.body.classList.add('can-genereate-gpt-translation');
	window.generateGPTTranslation = async () => {
		window.generateGPTTranslation = null;
		document.body.classList.remove('can-genereate-gpt-translation');
		document.dispatchEvent(new CustomEvent('gpt-new-task', { detail: { taskID, songID, songName }}));
		try {
			if (localLyrics && !configMatches) {
				if (window.currentLyrics?.hash === hash) {
					window.currentLyrics.lyrics = window.currentLyrics.lyrics.map((x) => {
						delete x.translatedLyric;
						return x;
					});
					window.currentLyrics.amend = false;
					document.dispatchEvent(new CustomEvent('lyrics-updated', { detail: window.currentLyrics }));
				}
			}
			await getGPTTranslation(originalLyrics, onStream, onDone, taskID);
		} catch (error) {
			if (window.currentLyrics?.hash === hash) {
				window.currentLyrics.lyrics = window.currentLyrics.lyrics.map((x) => {
					delete x.translatedLyric;
					return x;
				});
				window.currentLyrics.amend = false;
				document.dispatchEvent(new CustomEvent('lyrics-updated', { detail: window.currentLyrics }));
			}
			console.error(error);
			const msg = error.message;
			if (msg.startsWith('{')) {
				const json = JSON.parse(msg);
				if (json?.error?.code == 'invalid_api_key') {
					document.dispatchEvent(new CustomEvent('gpt-task-error', { detail: { taskID, error: 'API Key 无效'}}));
					return;
				}
				if (json?.error?.message) {
					document.dispatchEvent(new CustomEvent('gpt-task-error', { detail: { taskID, error: json.error.message}}));
					return;
				}
			}
			document.dispatchEvent(new CustomEvent('gpt-task-error', { detail: { taskID, error: error.message }}));
		}
	}
	//await simulateGPTTranslation(originalLyrics, onStream, onDone);
};

const parseLyricsToObject = (lyricsText) => {
	const lines = lyricsText.trim().split('\n');
	const lyricsObj = {};
	let currentLineNumber = 1;

	// 提取行号，无则自增
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine) {
			const lineNumberMatch = trimmedLine.match(/^(\d+)[\.、]\s*/);

			if (lineNumberMatch) {
				const lineNumber = parseInt(lineNumberMatch[1], 10);
				const cleanLine = trimmedLine.replace(/^\d+[\.、]\s*/, '');
				lyricsObj[lineNumber.toString()] = cleanLine;
				currentLineNumber = lineNumber + 1;
			} else {
				lyricsObj[currentLineNumber.toString()] = trimmedLine;
				currentLineNumber++;
			}
		}
	}

	return lyricsObj;
};

const saveLocalLyrics = async (hash, fullGPTResponse, model) => {
	const currentPrompt = getSetting('prompt');
	const temperature = getSetting('temperature');
	const topP = getSetting('top-p');
	const lyricsObj = parseLyricsToObject(fullGPTResponse);

	const content = JSON.stringify({
		model,
		temperature: parseFloat(temperature),
		topP: parseFloat(topP),
		Lyrics: lyricsObj,
		prompt: currentPrompt,
		version: 2,
		savedAt: new Date().toISOString()
	}, null, 2);

	await betterncm.fs.mkdir('gpt-translated-lyrics');
	await betterncm.fs.writeFile(`gpt-translated-lyrics/${hash}.txt`,
		new Blob([content], {
			type: 'text/plain'
		})
	);
}
const getLocalLyrics = async (hash) => {
	if (await betterncm.fs.exists(`gpt-translated-lyrics/${hash}.txt`)) {
		return await new Response(
			await betterncm.fs.readFile(`gpt-translated-lyrics/${hash}.txt`)
		).text();
	} else {
		return null;
	}
}


document.addEventListener('lyrics-updated', onLyricsUpdate);
if (window.currentLyrics) {
	onLyricsUpdate({detail: window.currentLyrics});
}

plugin.onLoad(() => {
	initUI();
});

plugin.onConfig((tools) => {
	const div = document.createElement('div');
	const divRoot = createRoot(div);
	divRoot.render(<Settings />);

	return div;
});