import { getSetting, setSetting } from './utils.js';
import { getAvailableModels, testApiConnection } from './api.js';

import * as React from 'react';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const useState = React.useState;
const useEffect = React.useEffect;

const darkTheme = createTheme({
	palette: {
		mode: 'dark',
	},
});
const lightTheme = createTheme({
	palette: {
		mode: 'light',
	},
});
const themes = {
	dark: darkTheme,
	light: lightTheme,
};

export function Settings(props) {
	const [theme, setTheme] = useState(document.body.classList.contains('ncm-light-theme') ? 'light' : 'dark');

	useEffect(() => {
		new MutationObserver(() => {
			if (document.body.classList.contains('ncm-light-theme')) {
				setTheme('light');
			} else {
				setTheme('dark');
			}
		}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
	}, []);

	const [ apiEndpoint, setApiEndpoint ] = useState(getSetting('api-endpoint'));
	const [ apiKey, setApiKey ] = useState(getSetting('api-key'));
	const [ model, setModel ] = useState(getSetting('model'));
	const [ temperature, setTemperature ] = useState(getSetting('temperature'));
	const [ topP, setTopP ] = useState(getSetting('top-p'));
	const [ prompt, setPrompt ] = useState(getSetting('prompt'));
	const [ availableModels, setAvailableModels ] = useState([]);
	const [ isTesting, setIsTesting ] = useState(false);
	const [ testStatus, setTestStatus ] = useState(null); // null, 'success', 'error'
	const DEFAULT_API_KEY_HELPER_TEXT = '输入 API 密钥';
	const [ apiKeyHelperText, setApiKeyHelperText ] = useState(DEFAULT_API_KEY_HELPER_TEXT);
	const [ apiConfigHash, setApiConfigHash ] = useState('');

	// API 测试
	const handleApiTest = async () => {
		if (isTesting) return;

		setIsTesting(true);
		setTestStatus(null);

		try {
			const result = await testApiConnection(apiEndpoint, apiKey, model);
			setTestStatus(result.success ? 'success' : 'error');
			if (!result.success) {
				setApiKeyHelperText(result.error);
			}
		} catch (error) {
			setTestStatus('error');
			setApiKeyHelperText(`检测异常: ${error.message}`);
		} finally {
			setIsTesting(false);
		}

		setTimeout(() => {
			setTestStatus(null);
			setApiKeyHelperText(DEFAULT_API_KEY_HELPER_TEXT);
		}, 5000);
	};

	useEffect(() => {
		const fetchModelsIfNeeded = async () => {
			const hasApiConfig = apiEndpoint && apiEndpoint.trim() !== '' && apiKey && apiKey.trim() !== '';
			const currentHash = `${apiEndpoint || ''}_${apiKey || ''}`;
			
			if (hasApiConfig && currentHash !== apiConfigHash) {
				try {
					const models = await getAvailableModels(apiEndpoint, apiKey);
					setAvailableModels(models);
					setApiConfigHash(currentHash);
				} catch (error) {
					setAvailableModels([]);
					setApiConfigHash(currentHash);
				}
			}
		};

		const timeoutId = setTimeout(fetchModelsIfNeeded, 500);
		return () => clearTimeout(timeoutId);
	}, [apiEndpoint, apiKey, model, apiConfigHash]);

	return (
		<ThemeProvider theme={themes[theme]}>
			<div className='lyric-bar-settings' style={{padding: '15px'}}>
				<Stack direction="column" spacing={2}>
					<Typography gutterBottom>在没有中文翻译的歌词界面，点击右侧栏的 GPT 小图标以开始翻译</Typography>
					<FormGroup>
						<Stack direction="column" spacing={2}>
							<TextField
								label="API URL"
								fullWidth
								variant="filled"
								defaultValue={getSetting('api-endpoint')}
								onChange={(e) => {
									const value = e.target.value;
									setApiEndpoint(value);
									setSetting('api-endpoint', value);
									setAvailableModels([]);
									setApiConfigHash('');
								}}
								helperText="OpenAI 兼容的 API 地址，如：https://api.openai.com/v1/"
								error={
									!!apiEndpoint &&
									!apiEndpoint.startsWith('https://') &&
									!apiEndpoint.startsWith('http://')
								}
							/>

							<Stack direction="row" spacing={1} alignItems="flex-start">
								<TextField
									label="API KEY"
									fullWidth
									variant="filled"
									defaultValue={getSetting('api-key')}
									onChange={(e) => {
										const value = e.target.value;
										setApiKey(value);
										setSetting('api-key', value);
										setApiKeyHelperText(DEFAULT_API_KEY_HELPER_TEXT);
										setAvailableModels([]);
										setApiConfigHash('');
									}}
									helperText={apiKeyHelperText}
									error={testStatus === 'error' && apiKeyHelperText !== DEFAULT_API_KEY_HELPER_TEXT}
									className="settings-api-key-helper"
								/>
								<Button
									variant="outlined"
									onClick={handleApiTest}	disabled={isTesting || !apiEndpoint?.trim()}
									className={`settings-api-test-btn ${testStatus === 'success' ? 'success' : testStatus === 'error' ? 'error' : ''}`}
								>
									{isTesting ? '...' : testStatus === 'success' ? '✔' :testStatus === 'error' ? '✕' : '检测'}
								</Button>
							</Stack>

							<Autocomplete
								freeSolo
								options={availableModels}
								value={model || ''}
								defaultValue={getSetting('model')}
								onChange={(event, newValue) => {
									if (newValue !== null) {
										setModel(newValue);
										setSetting('model', newValue);
									}
								}}
								onInputChange={(event, newInputValue) => {
									setModel(newInputValue);
									setSetting('model', newInputValue);
								}}
								renderInput={(params) => (
									<TextField
										{...params}
										label="模型名称"
										variant="filled"
										helperText="输入模型名称，如：gpt-3.5-turbo, deepseek-chat 等"
										fullWidth
									/>
								)}
								forcePopupIcon={false}
								openOnFocus={availableModels.length > 0}
								autoHighlight={true}
								filterOptions={(options, { inputValue }) => 
									!inputValue.trim() ? options : options.filter(option => 
										option.toLowerCase().includes(inputValue.trim().toLowerCase())
									)
								}
								renderOption={(props, option, { inputValue }) => {
									const optionStr = String(option);
									const searchText = inputValue.trim().toLowerCase();
									const optionLower = optionStr.toLowerCase();
									
									if (!searchText || !optionLower.includes(searchText)) {
										return <li {...props}>{optionStr}</li>;
									}
									
									const startIndex = optionLower.indexOf(searchText);
									return (
										<li {...props}>
											{optionStr.substring(0, startIndex)}
											<strong style={{ color: '#1976d2' }}>
												{optionStr.substring(startIndex, startIndex + searchText.length)}
											</strong>
											{optionStr.substring(startIndex + searchText.length)}
										</li>
									);
								}}
								className="settings-model-autocomplete"
								fullWidth
							/>

							<Stack direction="row" spacing={2} style={{ width: '100%' }}>
								<TextField
									label="模型温度"
									fullWidth
									variant="filled"
									type="number"
									inputProps={{
										min: 0,
										max: 2,
										step: 0.1
									}}
									defaultValue={getSetting('temperature')}
									onChange={(e) => {
										const value = e.target.value;
										setTemperature(value);
										setSetting('temperature', value);
									}}
									helperText="范围：0~2，默认0.8，留空不使用"
									error={temperature !== '' && temperature !== null && !(parseFloat(temperature || '0') >= 0 && parseFloat(temperature || '0') <= 2)}
								/>
								<TextField
									label="Top-P"
									fullWidth
									variant="filled"
									type="number"
									inputProps={{
										min: 0,
										max: 1,
										step: 0.1
									}}
									defaultValue={getSetting('top-p')}
									onChange={(e) => {
										const value = e.target.value;
										setTopP(value);
										setSetting('top-p', value);
									}}
									helperText="范围：0~1，留空不使用"
									error={topP !== '' && topP !== null && !(parseFloat(topP || '0') >= 0 && parseFloat(topP || '0') <= 1)}
								/>
							</Stack>

							<TextField
								label="提示词"
								fullWidth
								variant="filled"
								multiline
								minRows={4}
								maxRows={8}
								defaultValue={getSetting('prompt')}
								onChange={(e) => {
									setPrompt(e.target.value);
									setSetting('prompt', e.target.value);
								}}
								helperText="使用 {lyrics} 表示歌词内容。示例：将以下歌词翻译成简体中文，保持原意和韵律：\n{lyrics}"
							/>

							<Stack direction="row" spacing={2} style={{ width: '100%' }}>
								<Button variant="outlined" onClick={async () => {
									await betterncm.fs.mkdir('gpt-translated-lyrics');
									await betterncm.app.exec(
										`explorer "${await betterncm.app.getDataPath()}\\gpt-translated-lyrics"`,
										false,
										true,
									);
								}}>打开缓存目录</Button>
							</Stack>
						</Stack>
					</FormGroup>
				</Stack>
			</div>
		</ThemeProvider>
	);
}
