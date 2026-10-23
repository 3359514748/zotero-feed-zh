"""Opt-in live checks with synthetic public text, never user library content."""
import json
import re
import urllib.parse
import urllib.request

sample = 'This paper studies speech recognition and audio signal processing.'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
opener.addheaders = [('User-Agent', 'Mozilla/5.0')]
google = 'https://translate.googleapis.com/translate_a/single?' + urllib.parse.urlencode({
    'client': 'gtx', 'sl': 'en', 'tl': 'zh-CN', 'dt': 't', 'q': sample})
with opener.open(google, timeout=20) as response:
    data = json.load(response)
    result = ''.join(x[0] for x in data[0] if x[0])
    assert any('\u4e00' <= char <= '\u9fff' for char in result)
    print('Google PASS:', result)
try:
    with opener.open('https://www.bing.com/translator', timeout=20) as response:
        html = response.read().decode('utf8')
    key, token, *_ = json.loads(re.search(r'params_AbusePreventionHelper\s*=\s*(\[[^;]+\])', html)[1])
    ig = re.search(r'IG:\s*"([^"]+)"', html)[1]
    iid = re.search(r'data-iid="(translator\.[^"]+)"', html)[1]
    url = 'https://www.bing.com/ttranslatev3?' + urllib.parse.urlencode({'isVertical': 1, 'IG': ig, 'IID': iid})
    body = urllib.parse.urlencode({'fromLang': 'en', 'to': 'zh-Hans', 'text': sample, 'token': token, 'key': key}).encode()
    with opener.open(urllib.request.Request(url, data=body), timeout=20) as response:
        data = json.load(response)
        result = data[0]['translations'][0]['text']
        assert any('\u4e00' <= char <= '\u9fff' for char in result)
        print('Bing PASS:', result)
except Exception as error:
    print('Bing UNAVAILABLE:', type(error).__name__, str(error))
