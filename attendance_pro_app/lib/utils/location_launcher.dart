import 'package:url_launcher/url_launcher.dart';

class LocationLauncher {
  static Future<void> launchMaps(double lat, double lng) async {
    final String googleUrl = 'https://www.google.com/maps/search/?api=1&query=$lat,$lng';
    final Uri url = Uri.parse(googleUrl);
    
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      throw 'Could not launch mapping application.';
    }
  }
}
