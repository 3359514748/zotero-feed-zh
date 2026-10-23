from pathlib import Path
import json
import shutil

root = Path(__file__).absolute().parent.parent
profile = root / 'test-profile'
addon = root / 'test-addon'
profile.mkdir(exist_ok=True)
(profile / 'extensions').mkdir(exist_ok=True)
shutil.copytree(root / 'addon', addon, dirs_exist_ok=True)
with (addon / 'bootstrap.js').open('a', encoding='utf8') as out:
    out.write('\n' + (root / 'tests/zotero-harness.js').read_text(encoding='utf8'))
(profile / 'extensions/feed-zh@local.zotero').write_text(str(addon), encoding='utf8')
prefs = {
    'extensions.zotero.useDataDir': True,
    'extensions.zotero.dataDir': str(root / 'test-data'),
    'extensions.autoDisableScopes': 0,
    'extensions.zotero.firstRun': False,
    'extensions.zotero.firstRun2': False,
    'extensions.zotero.automaticScraperUpdates': False,
    'extensions.zotero.sync.autoSync': False,
    'extensions.zotero.reportTranslationFailure': False,
    'extensions.zotero.firstRunGuidance': False
}
(root / 'test-data').mkdir(exist_ok=True)
(profile / 'user.js').write_text('\n'.join('user_pref(' + json.dumps(k) + ', ' + json.dumps(v) + ');' for k, v in prefs.items()), encoding='utf8')
print(profile)
