import {
  Baby, Bell, BookOpen, Building, Calculator, Calendar, Droplets, FileCheck2, Gift, Globe, GraduationCap, HandHeart,
  Heart, Home, Image, Info, Landmark, LayoutGrid, Link, Mail, MapPin, MessageCircle, Moon, Newspaper, Phone,
  ShoppingBag, Star, Stethoscope, User, Users, Utensils, Video,
} from 'lucide-react-native';

/** İzinli ikonlar; liste services/backend/app/services/app_design.py ICONS ile aynıdır. */
export const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  home: Home, heart: Heart, 'hand-heart': HandHeart, 'shopping-bag': ShoppingBag, user: User, users: Users,
  'layout-grid': LayoutGrid, 'book-open': BookOpen, newspaper: Newspaper, calculator: Calculator, landmark: Landmark,
  'file-check': FileCheck2, info: Info, phone: Phone, 'message-circle': MessageCircle, mail: Mail, 'map-pin': MapPin,
  globe: Globe, gift: Gift, star: Star, moon: Moon, droplets: Droplets, utensils: Utensils,
  'graduation-cap': GraduationCap, stethoscope: Stethoscope, building: Building, baby: Baby, calendar: Calendar,
  bell: Bell, image: Image, video: Video, link: Link,
};

export const iconOf = (name?: string) => (name && ICONS[name]) || Heart;
