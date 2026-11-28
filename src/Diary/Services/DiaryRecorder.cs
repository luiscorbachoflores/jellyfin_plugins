using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Diary.Db;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Diary.Services;

/// <summary>
/// Apunta en el diario las películas que Jellyfin da por vistas. Solo escucha el evento público
/// <c>UserDataSaved</c>: un visionado terminado (<c>PlaybackFinished</c>) cuenta como «visto aquí»
/// y pulsar «marcar como visto» (<c>TogglePlayed</c>) como «marcado a mano». Reproducir a medias no
/// registra nada.
/// </summary>
public sealed class DiaryRecorder : IHostedService
{
    private readonly IUserDataManager _userData;
    private readonly DiaryRepository _repository;
    private readonly ILogger<DiaryRecorder> _logger;

    public DiaryRecorder(IUserDataManager userData, DiaryRepository repository, ILogger<DiaryRecorder> logger)
    {
        _userData = userData;
        _repository = repository;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _userData.UserDataSaved += OnSaved;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _userData.UserDataSaved -= OnSaved;
        return Task.CompletedTask;
    }

    private void OnSaved(object? sender, UserDataSaveEventArgs e)
    {
        try
        {
            if (e.Item is not Movie)
            {
                return;
            }

            var hours = Plugin.Instance?.Configuration.DedupeHours ?? 12;
            var userId = e.UserId.ToString("D", CultureInfo.InvariantCulture);
            var itemId = e.Item.Id.ToString("D", CultureInfo.InvariantCulture);
            var now = DateTime.UtcNow;

            if (e.SaveReason == UserDataSaveReason.PlaybackFinished && e.UserData.Played)
            {
                _repository.Record(userId, itemId, now, LocalDate(now), DiarySource.Played, hours);
            }
            else if (e.SaveReason == UserDataSaveReason.TogglePlayed)
            {
                if (e.UserData.Played)
                {
                    var when = e.UserData.LastPlayedDate is { } d ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : now;
                    _repository.Record(userId, itemId, when, LocalDate(when), DiarySource.Marked, hours);
                }
                else
                {
                    _repository.UndoMarked(userId, itemId, now, hours);
                }
            }
        }
        catch (Exception ex)
        {
            // Un fallo del diario nunca debe afectar a la reproducción ni al guardado del estado.
            _logger.LogWarning(ex, "Diary: no se pudo anotar el visionado.");
        }
    }

    internal static string LocalDate(DateTime utc) => utc.ToLocalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
