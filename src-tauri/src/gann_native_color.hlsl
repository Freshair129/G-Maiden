Texture2D<uint> planeY : register(t0);
Texture2D<uint> planeU : register(t1);
Texture2D<uint> planeV : register(t2);
Texture2D<uint> planeA : register(t3);
cbuffer Diagnostic : register(b0) { uint markerIndex; uint markerEnabled; uint2 unused; };

float4 vertex(uint id : SV_VertexID) : SV_Position {
    float2 p = float2((id << 1) & 2, id & 2);
    return float4(p * float2(2, -2) + float2(-1, 1), 0, 1);
}

float4 pixel(float4 position : SV_Position) : SV_Target {
    uint2 p = uint2(position.xy);
    if (markerEnabled != 0 && p.y >= 400 && p.y < 420 && p.x < 384) {
        uint column = p.x / 32;
        if (column == 0) return float4(1, 0, 1, 1);
        if (column == 11 || (((markerIndex + 1) >> (column - 1)) & 1) != 0) return 1;
        return float4(0, 0, 0, 1);
    }
    int y = int(planeY.Load(int3(p, 0))) - 16;
    int u = int(planeU.Load(int3(p / 2, 0))) - 128;
    int v = int(planeV.Load(int3(p / 2, 0))) - 128;
    int a = int(planeA.Load(int3(p, 0)));
    int3 rgb = int3(298 * y + 409 * v, 298 * y - 100 * u - 208 * v, 298 * y + 516 * u);
    rgb = clamp((rgb + 128) >> 8, 0, 255);
    rgb = (rgb * a + 127) / 255;
    return float4(float3(rgb), float(a)) / 255.0;
}
