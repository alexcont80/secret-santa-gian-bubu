from pathlib import Path
import os
from tempfile import TemporaryDirectory
from playwright.sync_api import expect, sync_playwright

BASE = os.getenv('SANTA_TEST_ORIGIN','https://127.0.0.1:8443')

def login(page, admin=False):
    page.goto(BASE)
    if admin:
        page.get_by_role('button', name='Area amministrativa', exact=True).click()
        page.get_by_label('Utente amministratore').fill('regia-test')
    page.get_by_label('Password', exact=True).fill('test-admin-password-unique' if admin else 'test-invitati')
    page.get_by_role('button', name='Entra', exact=True).click()
    expect(page.get_by_role('navigation')).to_be_visible()
    page.get_by_role('button', name='Festa').click()

def rsvp(page, name, companion='', food=''):
    page.get_by_label('Nome', exact=True).fill(name)
    page.get_by_label('Cognome', exact=True).fill('Collaudo')
    page.get_by_label('Nome e cognome del companion').fill(companion)
    page.get_by_label('Cosa porti?').fill(food)
    page.get_by_role('button', name='Salva partecipazione').click()
    expect(page.get_by_text('Conserva i codici.', exact=False)).to_be_visible()
    return page.locator('.reveal-box code').all_text_contents()

with TemporaryDirectory() as profiles, sync_playwright() as pw:
    profiles = Path(profiles)
    def open_browser(key):
        return pw.chromium.launch_persistent_context(
            str(profiles / key), headless=True, chromium_sandbox=True,
            ignore_https_errors=True, permissions=['camera'],
            viewport={'width': 430 if key != 'admin' else 1200, 'height': 900},
            args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    a, b, c = [open_browser(key) for key in ('guest-a','guest-b','admin')]
    pa,pb,pc = [x.pages[0] for x in (a,b,c)]
    login(pa); login(pb); login(pc, True)
    assert pa.evaluate('window.isSecureContext')
    codes_a=rsvp(pa,'Alice','Chiara Collaudo','lasagne, prosecco e tiramisù')
    codes_b=rsvp(pb,'Bruno',food='panettone')
    assert len(codes_a)==2 and len(codes_b)==1
    pb.wait_for_timeout(350)
    pb.reload()
    expect(pb.get_by_role('heading',name='Chi ci sarà')).to_be_visible()
    expect(pb.get_by_text('Alice Collaudo',exact=True)).to_be_visible()
    pb.get_by_role('button',name='Menu smart').click()
    expect(pb.get_by_text('lasagne',exact=True)).to_be_visible()
    expect(pb.get_by_text('tiramisù',exact=True)).to_be_visible()
    pa.get_by_role('button', name='Selfie wall').click()
    pa.get_by_role('button',name='Apri fotocamera').click()
    pa.wait_for_function('() => document.querySelector("video")?.videoWidth > 0')
    pa.get_by_role('button',name='Scatta').click()
    expect(pa.get_by_alt_text('Anteprima del selfie')).to_be_visible()
    pa.get_by_role('button',name='Conferma foto').click()
    expect(pa.get_by_alt_text('Selfie dalla festa')).to_be_visible()
    pb.get_by_role('button', name='Selfie wall').click()
    expect(pb.get_by_alt_text('Selfie dalla festa')).to_be_visible(timeout=18000)
    reject=pb.request.post(BASE+'/api/admin/draw',headers={'x-party':'1'},data={'confirm':True})
    assert reject.status==403
    pc.get_by_role('button',name='Regia',exact=False).click()
    pc.once('dialog', lambda dialog: dialog.accept())
    pc.get_by_role('button',name='Estrai i nomi',exact=True).click()
    expect(pc.get_by_text('Estrazione completata.',exact=False)).to_be_visible()
    actual=[]
    for page,codes in ((pa,codes_a),(pb,codes_b)):
        page.get_by_role('button',name='Secret Santa',exact=False).first.click()
        for code in codes:
            page.get_by_label('Il tuo codice personale').fill(code)
            page.get_by_role('button',name='Apri il regalo in privato').click()
            expect(page.get_by_text('Il tuo regalo è per')).to_be_visible()
            actual.append(page.locator('.reveal-box h3').inner_text())
    assert set(actual)=={'Alice Collaudo','Bruno Collaudo','Chiara Collaudo'}
    assert all(recv!=sender for recv,sender in zip(actual,['Alice Collaudo','Chiara Collaudo','Bruno Collaudo']))
    a.close()
    reopened=open_browser('guest-a')
    pa=reopened.pages[0]
    pa.goto(BASE)
    expect(pa.get_by_text('Alice Collaudo',exact=True).first).to_be_visible()
    pa.get_by_role('button',name='Selfie wall').click()
    expect(pa.get_by_alt_text('Selfie dalla festa')).to_be_visible()
    pa.get_by_role('button',name='Party Live').click()
    expect(pa.get_by_role('button',name='Schermo intero')).to_be_visible()
    reopened.close();b.close();c.close()
    print('OK: tre sessioni indipendenti, camera in HTTPS con dispositivo sintetico, foto condivisa, riapertura, permessi e abbinamenti.')
