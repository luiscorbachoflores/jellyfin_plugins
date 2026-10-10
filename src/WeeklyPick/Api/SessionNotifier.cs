using System;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.WeeklyPick.Api;

/// <summary>Intenta avisar tambien a clientes que no son el navegador (Swiftfin, Streamyfin, Moonfin...),
/// que no ejecutan el script inyectado en index.html. Usa el comando nativo "Display Message" de
/// Jellyfin cuando arranca una sesion nueva; los clientes que no lo soporten simplemente lo ignoran,
/// no hay nada que se rompa.</summary>
public class SessionNotifier : IHostedService
{
    private readonly ISessionManager _sessionManager;
    private readonly SeenStore _store;
    private readonly ILogger<SessionNotifier> _logger;

    public SessionNotifier(ISessionManager sessionManager, SeenStore store, ILogger<SessionNotifier> logger)
    {
        _sessionManager = sessionManager;
        _store = store;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _sessionManager.SessionStarted += OnSessionStarted;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _sessionManager.SessionStarted -= OnSessionStarted;
        return Task.CompletedTask;
    }

    private async void OnSessionStarted(object? sender, SessionEventArgs e)
    {
        try
        {
            var session = e.SessionInfo;
            _logger.LogDebug("WeeklyPick: SessionStarted client={Client} user={User}", session?.Client, session?.UserId);
            if (session is null || session.UserId == Guid.Empty)
            {
                return;
            }

            // El cliente web ya muestra el modal rico por su cuenta (script inyectado): que gane esa via.
            var clientName = session.Client ?? string.Empty;
            if (clientName.IndexOf("Jellyfin Web", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return;
            }

            var config = Plugin.Instance!.Configuration;
            if (!config.Enabled)
            {
                return;
            }

            var weekKey = Jellyfin.Plugin.WeeklyPick.Api.WeeklyPickController.CurrentWeekKey(DateTime.Now);
            var entry = Jellyfin.Plugin.WeeklyPick.Api.WeeklyPickController.EntryFor(config, weekKey);
            if (entry is null || string.IsNullOrWhiteSpace(entry.Text))
            {
                return;
            }

            var userId = session.UserId.ToString("N");
            if (_store.WasNotifiedThisWeek(userId, weekKey))
            {
                return;
            }

            // En el momento de SessionStarted el websocket de la app todavia no esta conectado y el mensaje
            // se perderia: esperamos (hasta ~60 s) a que la sesion tenga un controlador activo.
            var sent = false;
            for (var i = 0; i < 30 && !sent; i++)
            {
                if (session.SessionControllers.Count > 0)
                {
                    if (_store.WasNotifiedThisWeek(userId, weekKey))
                    {
                        return;
                    }

                    _store.MarkNotified(userId, weekKey);
                    _logger.LogInformation("WeeklyPick: aviso nativo a cliente {Client} (sesion {Session}).", clientName, session.Id);
                    await _sessionManager.SendMessageCommand(
                        session.Id,
                        session.Id,
                        new MessageCommand { Header = "Recomendación de la semana", Text = entry.Text, TimeoutMs = 20000 },
                        CancellationToken.None).ConfigureAwait(false);
                    sent = true;
                }
                else
                {
                    await Task.Delay(2000).ConfigureAwait(false);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WeeklyPick: no se pudo enviar el aviso nativo de sesion.");
        }
    }
}
