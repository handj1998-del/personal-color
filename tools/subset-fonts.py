# 앱에 쓰인 글자만 남긴 woff2 만들기 (OFL: 예약 이름이 있는 글꼴은 이름을 바꿔 저장)
import glob, sys
from fontTools import subset
from fontTools.ttLib import TTFont
S='/workspace/pcreview/cover/fonts_src/'; O='/workspace/pcreview/cover/out/'
H=open('/workspace/pcreview/cover/chars_hangul.txt').read()
txt=''.join(open(f).read() for f in glob.glob('/workspace/personal-color-fixes/js/*.js')+['/workspace/personal-color-fixes/index.html'])
extra=''.join(sorted({c for c in txt if 0x2000<=ord(c)<=0x2BFF or 0xA0<=ord(c)<=0x2FF or 0x3000<=ord(c)<=0x303F or 0xFF00<=ord(c)<=0xFFEF}))
ASCII=''.join(chr(i) for i in range(0x20,0x7F))
def make(src, out, text, rename=None, latin_only=False):
  opt=subset.Options(); opt.flavor='woff2'; opt.layout_features=['*']; opt.name_IDs=['*']; opt.hinting=False; opt.desubroutinize=True
  f=TTFont(S+src); sub=subset.Subsetter(opt); sub.populate(text=text); sub.subset(f)
  if rename:
    for rec in f['name'].names:
      if rec.nameID in (1,3,4,6,16,21):
        old=rec.toUnicode(); new=old
        for a,b in rename.items(): new=new.replace(a,b).replace(a.replace(' ',''),b.replace(' ',''))
        rec.string=new
  f.flavor='woff2'; f.save(O+out)
  import os; print(out, round(os.path.getsize(O+out)/1024,1),'KB')
KR=ASCII+extra+H
make('PretendardVariable.ttf','pc-sans-var.woff2',KR,{'Pretendard':'PC Sans'})
LAT=ASCII+'·–—‘’“”…©'
make('CormorantGaramond[wght].ttf','cormorant-garamond-var.woff2',LAT)
