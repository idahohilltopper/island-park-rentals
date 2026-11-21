import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
S='/tmp/claude-0/-home-user/35f3b3df-cdc4-5031-b9e3-0b040b98a261/scratchpad/enh/'
U='/root/.claude/uploads/35f3b3df-cdc4-5031-b9e3-0b040b98a261/'

def box(a,r):
    # mean filter with radius r via cumulative sums (edge-padded)
    k=2*r+1
    p=np.pad(a,((r,r),(r,r))+((0,0),)*(a.ndim-2),mode='edge')
    c=np.cumsum(np.cumsum(p,0),1)
    c=np.pad(c,((1,0),(1,0))+((0,0),)*(a.ndim-2))
    s=c[k:,k:]-c[:-k,k:]-c[k:,:-k]+c[:-k,:-k]
    return s/(k*k)

def minfilter(a,r):
    k=2*r+1
    p=np.pad(a,r,mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view as sw
    return sw(p,(k,k)).min(axis=(2,3))

def guided(I,p,r,eps):
    mI=box(I,r); mp=box(p,r); cIp=box(I*p,r)-mI*mp; vI=box(I*I,r)-mI*mI
    a=cIp/(vI+eps); b=mp-a*mI
    return box(a,r)*I+box(b,r)

def dehaze(img,omega=0.75,t0=0.35,patch=7):
    h,w,_=img.shape
    sm=np.asarray(Image.fromarray((img*255).astype(np.uint8)).resize((w//4,h//4),Image.BILINEAR),dtype=np.float32)/255
    dark=minfilter(sm.min(2),patch)
    n=max(1,int(dark.size*0.001)); idx=np.argsort(dark.ravel())[-n:]
    A=sm.reshape(-1,3)[idx].mean(0); A=np.clip(A,0.5,0.97)
    t=1-omega*minfilter((sm/A).min(2),patch)
    gray=sm.mean(2)
    t=guided(gray,t,12,1e-3)
    t=np.asarray(Image.fromarray(t.astype(np.float32)).resize((w,h),Image.BICUBIC))
    t=np.clip(t,t0,1)[...,None]
    return np.clip((img-A)/t+A,0,1)

def enhance(src,out,omega=0.75,gamma=0.88,sat=1.25,clarity=0.55,sharp=(1.6,140,2),wb=0.6,lo=0.4,hi=99.6):
    im=np.asarray(Image.open(U+src).convert('RGB'),dtype=np.float32)/255
    im=dehaze(im,omega=omega)
    # partial gray-world white balance to remove the green/teal cast
    m=im.reshape(-1,3).mean(0); g=m.mean(); gain=(g/m)**wb; im=np.clip(im*gain,0,1)
    # levels stretch per overall luminance range
    lum=im.mean(2); a,b=np.percentile(lum,[lo,hi]); im=np.clip((im-a)/(b-a),0,1)
    im=im**gamma
    img=Image.fromarray((im*255).astype(np.uint8))
    # local contrast ("clarity")
    L=np.asarray(img.convert('L'),dtype=np.float32)
    bl=np.asarray(img.convert('L').filter(ImageFilter.GaussianBlur(40)),dtype=np.float32)
    d=(L-bl)*clarity
    arr=np.asarray(img,dtype=np.float32)+d[...,None]
    img=Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
    img=ImageEnhance.Color(img).enhance(sat)
    img=img.filter(ImageFilter.UnsharpMask(radius=sharp[2],percent=int(sharp[1]),threshold=2))
    img.save(S+out,quality=92,optimize=True,subsampling=0)
    return img

if __name__=='__main__':
    for src,out in [('a7086ccb-image.jpg','IMG_6543.jpg'),('df951a43-image.jpg','IMG_6542.jpg'),('2667e5ba-image.jpg','IMG_6544.jpg')]:
        enhance(src,out); print('done',out)
    # before/after contact sheet
    rows=[]
    for src,out in [('a7086ccb-image.jpg','IMG_6543.jpg'),('df951a43-image.jpg','IMG_6542.jpg'),('2667e5ba-image.jpg','IMG_6544.jpg')]:
        a=Image.open(U+src).convert('RGB'); b=Image.open(S+out).convert('RGB')
        h=480; a=a.resize((round(a.width*h/a.height),h)); b=b.resize((round(b.width*h/b.height),h)); rows.append((a,b))
    W=max(a.width+b.width for a,b in rows)+30; H=sum(a.height for a,_ in rows)+10*len(rows)
    sheet=Image.new('RGB',(W,H),'white'); y=0
    for a,b in rows: sheet.paste(a,(0,y)); sheet.paste(b,(a.width+30,y)); y+=a.height+10
    sheet.save(S+'before_after.jpg',quality=85)
