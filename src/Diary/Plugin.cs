using System;
using System.Collections.Generic;
using System.Globalization;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Diary;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "Diary";

    public override string Description => "Diario de cine por usuario en /diary: lo que has visto, con fecha y nota, y un resumen del año.";

    public override Guid Id => Guid.Parse("5d0c2a41-7b3e-4f6d-9a18-2c4e6f8b0d13");

    public static Plugin? Instance { get; private set; }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                DisplayName = "Diario",
                EnableInMainMenu = true,
                MenuSection = "server",
                MenuIcon = "menu_book",
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace),
            },
        };
    }
}
