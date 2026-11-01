"""Construit le site installable dans _site/ à partir de src/mijonote.html et web/."""
import pathlib, re, shutil

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "_site"
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(root / "web", out)

html = (root / "src" / "mijonote.html").read_text(encoding="utf-8")
html = html.replace('"/_blob/"', '"_blob/"')
html = re.sub(r'<link rel="apple-touch-icon" href="data:[^"]*">', "", html)
head = (
    '<link rel="manifest" href="manifest.webmanifest">'
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
    '<meta name="theme-color" content="#b8402c">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-title" content="Mijonote">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
    '<script>window.GATE_CFG={app:"mijonote",name:"Mijonote",url:"https://vvxkkqcmjrwytagbxdfg.supabase.co",key:"sb_publishable_A-kJQIoJXxdXmjHF8iM40g_RP6myhMo",link:"https://tulliodisegni-art.github.io/Mijonote/",logo:"icons/icon-192.png",accent:"#E9B949",isOwner:function(){try{return JSON.parse(localStorage.getItem("mj_owner")||"false")===true}catch(e){return false}}};</script><script src="gate.js"></script>'
    '<script src="shim.js"></script>'
)
assert html.count("</head>") >= 1
html = html.replace("</head>", head + "</head>", 1)
(out / "index.html").write_text(html, encoding="utf-8")
print("ok", out / "index.html", len(html))
