// Isolated benchmark only. No application IPC, credentials, telemetry or game integration.
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

public class NativeHost : Form {
    WebView2 web = new WebView2();
    string root;
    string port;
    string mode;
    public NativeHost(string directory,string debugPort,string renderer) {
        root=directory;
        port=debugPort;
        mode=renderer;
        Text="Maiden Motion — isolated WebView2 benchmark";
        ClientSize=new Size(1280,800);
        StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(9,14,21);
        web.Dock=DockStyle.Fill;
        web.DefaultBackgroundColor=Color.Transparent;
        Controls.Add(web);
        Shown+=Ready;
    }
    async void Ready(object sender, EventArgs args) {
        try {
            var options=new CoreWebView2EnvironmentOptions("--remote-debugging-port="+port+" --remote-allow-origins=http://localhost:"+port);
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"native-profile"),options);
            await web.EnsureCoreWebView2Async(environment);
            File.WriteAllText(Path.Combine(root,"native-version.txt"),environment.BrowserVersionString);
            web.CoreWebView2.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
            web.CoreWebView2.WebResourceRequested+=(s,e)=>{
                Uri uri;
                if(Uri.TryCreate(e.Request.Uri,UriKind.Absolute,out uri) && uri.Scheme!="data" && uri.Scheme!="blob" && !(uri.Host=="127.0.0.1" && uri.Port==8768))
                    e.Response=environment.CreateWebResourceResponse(null,403,"Local test only","");
            };
            web.CoreWebView2.Navigate("http://127.0.0.1:8768/?benchmark=1&mode="+mode);
        } catch(Exception ex) {
            File.WriteAllText(Path.Combine(root,"native-error.txt"),ex.ToString());Close();
        }
    }
    [STAThread] public static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NativeHost(Path.GetFullPath(args[0]),args.Length>1?args[1]:"9242",args.Length>2?args[2]:"layers"));
    }
}
