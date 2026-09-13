"""Windows PDH English counters, process-specific; unavailable is never zero."""
import ctypes as C, re
from ctypes import wintypes as W
class Value(C.Structure):
    _fields_=[('status',W.DWORD),('value',C.c_double)]
class Item(C.Structure):
    _fields_=[('name',W.LPWSTR),('value',Value)]
class GPU:
    def __init__(self):
        self.pdh=C.WinDLL('pdh');self.query=C.c_void_p();self.counter=C.c_void_p();self.error=None
        try:
            for name in ['PdhOpenQueryW','PdhAddEnglishCounterW','PdhCollectQueryData','PdhGetFormattedCounterArrayW']:
                getattr(self.pdh,name).restype=W.DWORD
            assert self.pdh.PdhOpenQueryW(None,0,C.byref(self.query))==0
            self.pdh.PdhAddEnglishCounterW.argtypes=[C.c_void_p,W.LPCWSTR,C.c_size_t,C.POINTER(C.c_void_p)]
            assert self.pdh.PdhAddEnglishCounterW(self.query,r'\GPU Engine(*)\Utilization Percentage',0,C.byref(self.counter))==0
            self.pdh.PdhCollectQueryData(self.query)
        except Exception as e:self.error=repr(e)
    def sample(self,pids):
        if self.error:return None
        if self.pdh.PdhCollectQueryData(self.query)!=0:return None
        size=W.DWORD();count=W.DWORD()
        flags=0x200|0x8000 # DOUBLE | NOCAP100
        self.pdh.PdhGetFormattedCounterArrayW(self.counter,flags,C.byref(size),C.byref(count),None)
        if not size.value:return None
        buf=C.create_string_buffer(size.value)
        if self.pdh.PdhGetFormattedCounterArrayW(self.counter,flags,C.byref(size),C.byref(count),buf)!=0:return None
        values=C.cast(buf,C.POINTER(Item));engines={}
        for i in range(count.value):
            item=values[i];name=item.name or ''
            m=re.search(r'pid_(\d+).*engtype_(.+)',name,re.I)
            if m and int(m[1]) in pids and item.value.status in [0,1]:
                engines[m[2]]=engines.get(m[2],0)+max(0,item.value.value)
        return engines
    def close(self):
        if self.query:self.pdh.PdhCloseQuery(self.query)
