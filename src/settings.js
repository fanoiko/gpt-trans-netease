import { getSetting, setSetting } from './utils.js';
import { getAvailableModels } from './api.js';

import * as React from 'react';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const useState = React.useState;
const useEffect = React.useEffect;
const useLayoutEffect = React.useLayoutEffect;
const useMemo = React.useMemo;
const useCallback = React.useCallback;
const useRef = React.useRef;

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

	const [ apiEndpoint, setApiEndpoint ] = useState(getSetting('api-endpoint', 'https://api.openai.com/v1/'));
	const [ apiKey, setApiKey ] = useState(getSetting('api-key', ''));
	const [ model, setModel ] = useState(getSetting('model', 'gpt-3.5-turbo'));
	const [ temperature, setTemperature ] = useState(getSetting('temperature', '0.8'));
	const [ topP, setTopP ] = useState(getSetting('top-p', '-1'));
	const [ prompt, setPrompt ] = useState(getSetting('prompt', 'Translate the following lyrics into Simplified Chinese:\n{lyrics}'));
	const [ availableModels, setAvailableModels ] = useState([]);

	useEffect(() => {
		const fetchModelsIfNeeded = async () => {
			if (!model && apiEndpoint && apiEndpoint.trim() !== '') {
				try {
					const models = await getAvailableModels(apiEndpoint, apiKey);
					setAvailableModels(models);
				} catch (error) {
					setAvailableModels([]);
				}
			}
		};

		const timeoutId = setTimeout(fetchModelsIfNeeded, 500);
		return () => clearTimeout(timeoutId);
	}, [apiEndpoint, apiKey, model]);

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
								defaultValue={getSetting('api-endpoint', 'https://api.openai.com/v1/')}
								onChange={(e) => {
									setApiEndpoint(e.target.value);
									setSetting('api-endpoint', e.target.value);
								}}
								helperText="OpenAI兼容的API地址，如：https://api.openai.com/v1/"
								error={
									!apiEndpoint.startsWith('https://') &&
									!apiEndpoint.startsWith('http://')
								}
							/>

							<TextField
								label="API Key"
								fullWidth
								variant="filled"
								defaultValue={getSetting('api-key', '')}
								onChange={(e) => {
									setApiKey(e.target.value);
									setSetting('api-key', e.target.value);
								}}
								helperText="输入 API 密钥"
							/>

							<Autocomplete
								freeSolo
								options={availableModels}
								value={model}
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
								disableClearable
								forcePopupIcon={false}
								openOnFocus={availableModels.length > 0}
								loading={false}
								loadingText=""
								noOptionsText=""
								filterOptions={(options, state) => options}
								sx={{
									width: '100%',
									'& .MuiAutocomplete-endAdornment': {
										display: 'none'
									}
								}}
								fullWidth
							/>

							<Stack direction="row" spacing={2} style={{ width: '100%' }}>
								<TextField
									label="模型温度"
									fullWidth
									variant="filled"
									type="number"
									inputProps={{
										min: -1,
										max: 2,
										step: 0.1
									}}
									defaultValue={getSetting('temperature', '0.8')}
									onChange={(e) => {
										const value = e.target.value;
										setTemperature(value);
										setSetting('temperature', value);
									}}
									helperText="范围：-1（关闭）, 0~2，默认0.8"
									error={temperature !== '' && (temperature < -1 || temperature > 2)}
								/>
								<TextField
									label="Top-P"
									fullWidth
									variant="filled"
									type="number"
									inputProps={{
										min: -1,
										max: 1,
										step: 0.1
									}}
									defaultValue={getSetting('top-p', '-1')}
									onChange={(e) => {
										const value = e.target.value;
										setTopP(value);
										setSetting('top-p', value);
									}}
									helperText="范围：-1（关闭）, 0~1，默认-1"
									error={topP !== '' && (topP < -1 || topP > 1)}
								/>
							</Stack>

							<TextField
								label="提示词"
								fullWidth
								variant="filled"
								multiline
								minRows={4}
								maxRows={8}
								defaultValue={getSetting('prompt', 'Translate the following lyrics into Simplified Chinese:\n{lyrics}')}
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
